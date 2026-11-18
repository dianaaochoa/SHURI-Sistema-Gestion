<?php

namespace App\Services\Purchasing;

use App\Models\PartRequest;
use App\Models\PriceHistory;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\SupplierPayment;
use App\Models\User;
use App\Notifications\PartArrivedNotification;
use App\Services\AuditService;
use App\Services\Cash\CashShiftService;
use App\Services\FolioService;
use App\Services\Inventory\InventoryService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Compras a proveedores (RF-15, AD5, J5, C7):
 *  - Pedido (purchase_orders): agrupa solicitudes de refacción sin stock.
 *  - Compra (purchases): la mercancía que llega con su factura; el stock sube.
 *  - Pagos al proveedor (supplier_payments): cuentas por pagar; en efectivo salen del turno de caja.
 */
class PurchaseService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly CashShiftService $cash,
        private readonly FolioService $folios,
        private readonly AuditService $audit,
    ) {}

    /**
     * Pedido en borrador. Las solicitudes de refacción indicadas se agrupan como renglones.
     *
     * @param  array<string, mixed>  $data
     */
    public function createOrder(array $data, User $by): PurchaseOrder
    {
        return DB::transaction(function () use ($data, $by) {
            $order = PurchaseOrder::create([
                'folio' => $this->folios->next('purchase_order'),
                'supplier_id' => $data['supplier_id'],
                'requested_by' => $by->id,
                'status' => 'draft',
                'expected_date' => $data['expected_date'] ?? null,
                'payment_terms' => $data['payment_terms'] ?? 'cash_on_delivery',
                'receive_at' => $data['receive_at'] ?? 'counter',
                'notify_technician' => $data['notify_technician'] ?? true,
                'notes' => $data['notes'] ?? null,
            ]);

            // Solicitudes del taller que se agrupan en el pedido (RF-15)
            foreach ($data['part_requests'] ?? [] as $i => $folio) {
                $request = PartRequest::with('product')->where('folio', $folio)->lockForUpdate()->first();

                if (! $request || $request->status !== 'pending') {
                    throw ValidationException::withMessages(["part_requests.{$i}" => "La solicitud {$folio} no está pendiente."]);
                }

                PurchaseOrderItem::create([
                    'purchase_order_id' => $order->id,
                    'product_id' => $request->product_id,
                    'service_order_id' => $request->service_order_id,
                    'part_request_id' => $request->id,
                    'description' => $request->description,
                    'quantity' => $request->quantity,
                    'unit_cost' => (float) ($request->product?->purchase_price ?? 0),
                ]);
            }

            // Renglones agregados a mano (para surtir el mostrador, por ejemplo)
            foreach ($data['items'] ?? [] as $item) {
                $product = ! empty($item['product_id']) ? Product::find($item['product_id']) : null;

                PurchaseOrderItem::create([
                    'purchase_order_id' => $order->id,
                    'product_id' => $product?->id,
                    'description' => $product?->name ?? $item['description'],
                    'quantity' => (int) $item['quantity'],
                    'unit_cost' => round((float) ($item['unit_cost'] ?? $product?->purchase_price ?? 0), 2),
                ]);
            }

            if (! $order->purchaseOrderItems()->exists()) {
                throw ValidationException::withMessages(['items' => 'El pedido necesita al menos un renglón.']);
            }

            $this->refreshEstimate($order);
            $this->audit->log('purchasing', 'purchase_order_created', "Pedido {$order->folio} en borrador", $by->id, 'purchase_orders', $order->id);

            return $order->fresh(['supplier', 'purchaseOrderItems']);
        });
    }

    /** Enviar al proveedor: las solicitudes ligadas pasan a "pedida al proveedor". */
    public function sendOrder(PurchaseOrder $order, User $by, ?string $supplierFolio): PurchaseOrder
    {
        $this->expectOrder($order, ['draft'], 'Solo se puede enviar un pedido en borrador.');

        DB::transaction(function () use ($order, $by, $supplierFolio) {
            $order->forceFill(['status' => 'sent', 'supplier_folio' => $supplierFolio])->save();

            PartRequest::whereIn('id', $order->purchaseOrderItems()->whereNotNull('part_request_id')->pluck('part_request_id'))
                ->update(['status' => 'ordered', 'purchase_order_id' => $order->id, 'handled_by' => $by->id, 'handled_at' => now()]);

            $this->audit->log('purchasing', 'purchase_order_sent', "Pedido {$order->folio} enviado al proveedor", $by->id, 'purchase_orders', $order->id);
        });

        return $order->fresh(['supplier', 'purchaseOrderItems']);
    }

    /** Cancelar un pedido sin recibir: las solicitudes vuelven a "pendiente". */
    public function cancelOrder(PurchaseOrder $order, User $by): PurchaseOrder
    {
        $this->expectOrder($order, ['draft', 'sent'], 'Solo se puede cancelar un pedido que no se ha recibido.');

        DB::transaction(function () use ($order, $by) {
            $order->forceFill(['status' => 'cancelled'])->save();

            PartRequest::where('purchase_order_id', $order->id)->where('status', 'ordered')
                ->update(['status' => 'pending', 'purchase_order_id' => null]);

            $this->audit->log('purchasing', 'purchase_order_cancelled', "Pedido {$order->folio} cancelado", $by->id, 'purchase_orders', $order->id);
        });

        return $order->fresh(['supplier', 'purchaseOrderItems']);
    }

    /**
     * Llega la mercancía de un pedido (puede ser parcial). Se registra la compra con su
     * factura, sube el stock y las solicitudes del taller quedan listas para entregarse.
     *
     * @param  array<string, mixed>  $data
     */
    public function receiveOrder(PurchaseOrder $order, User $by, array $data): Purchase
    {
        $this->expectOrder($order, ['sent', 'partially_received'], 'Solo se recibe mercancía de un pedido enviado.');

        return DB::transaction(function () use ($order, $by, $data) {
            $order = PurchaseOrder::lockForUpdate()->findOrFail($order->id);
            $lines = [];
            $arrived = [];

            foreach ($data['items'] as $i => $row) {
                $item = PurchaseOrderItem::where('purchase_order_id', $order->id)->find($row['item_id']);

                if (! $item) {
                    throw ValidationException::withMessages(["items.{$i}.item_id" => 'El renglón no es de este pedido.']);
                }

                $pending = $item->quantity - $item->received_quantity;
                $quantity = (int) $row['quantity'];

                if ($quantity > $pending) {
                    throw ValidationException::withMessages(["items.{$i}.quantity" => "De «{$item->description}» solo faltan {$pending} pieza(s)."]);
                }

                // Una pieza que el técnico solo describió necesita su producto del catálogo para entrar al stock
                $productId = $item->product_id ?? ($row['product_id'] ?? null);
                if (! $productId || ! Product::whereKey($productId)->exists()) {
                    throw ValidationException::withMessages(["items.{$i}.product_id" => "Elige el producto del catálogo para «{$item->description}»."]);
                }

                if (! $item->product_id) {
                    $item->product_id = $productId;
                }
                $item->received_quantity += $quantity;
                $item->save();

                $lines[] = ['product_id' => $productId, 'quantity' => $quantity, 'unit_cost' => (float) ($row['unit_cost'] ?? $item->unit_cost)];

                if ($item->part_request_id) {
                    $arrived[] = $item->part_request_id;
                }
            }

            $purchase = $this->registerPurchase($order->supplier_id, $lines, $by, $data, $order);

            $allReceived = ! $order->purchaseOrderItems()->whereColumn('received_quantity', '<', 'quantity')->exists();
            $order->forceFill(['status' => $allReceived ? 'received' : 'partially_received'])->save();

            // Las solicitudes vuelven a "pendiente": ya hay stock y el jefe las entrega (J5)
            $requests = PartRequest::with(['technician', 'serviceOrder'])->whereIn('id', $arrived)->where('status', 'ordered')->get();
            foreach ($requests as $request) {
                $request->forceFill(['status' => 'pending'])->save();

                if ($order->notify_technician && $request->technician) {
                    $request->technician->notify(new PartArrivedNotification($request));
                }
            }

            return $purchase;
        });
    }

    /**
     * Compra con factura (desde un pedido o directa en C7): sube el stock, actualiza el costo
     * si cambió y deja la cuenta por pagar.
     *
     * @param  array<int, array{product_id: int, quantity: int, unit_cost: float}>  $lines
     * @param  array<string, mixed>  $data
     */
    public function registerPurchase(int $supplierId, array $lines, User $by, array $data, ?PurchaseOrder $order = null): Purchase
    {
        return DB::transaction(function () use ($supplierId, $lines, $by, $data, $order) {
            $subtotal = round(array_sum(array_map(fn ($l) => $l['quantity'] * $l['unit_cost'], $lines)), 2);

            $purchase = Purchase::create([
                'folio' => $this->folios->next('purchase'),
                'supplier_id' => $supplierId,
                'purchase_order_id' => $order?->id,
                'user_id' => $by->id,
                'supplier_invoice' => $data['supplier_invoice'] ?? null,
                'purchase_date' => $data['purchase_date'] ?? now()->toDateString(),
                'subtotal' => $subtotal,
                'tax' => round((float) ($data['tax'] ?? 0), 2),
                'amount_paid' => 0,
                'payment_status' => 'pending',
                'due_date' => $data['due_date'] ?? null,
                'notes' => $data['notes'] ?? null,
            ]);

            foreach ($lines as $line) {
                PurchaseItem::create(['purchase_id' => $purchase->id] + $line);

                $this->inventory->move($line['product_id'], 'stock_in', $line['quantity'], $by,
                    "Compra {$purchase->folio}".($purchase->supplier_invoice ? " · factura {$purchase->supplier_invoice}" : ''),
                    ['purchase_id' => $purchase->id]);

                $this->updateCost($line['product_id'], $line['unit_cost'], $by, $purchase->folio);
            }

            $this->audit->log('purchasing', 'purchase_registered', "Compra {$purchase->folio} por \${$subtotal}", $by->id, 'purchases', $purchase->id);

            // refresh(): `total` es una columna calculada por MySQL
            return $purchase->refresh()->load(['supplier', 'purchaseItems.product']);
        });
    }

    /**
     * AD5 Pago al proveedor. En efectivo sale del turno de caja abierto de quien paga
     * (lo resta el corte en v_shift_cash_summary).
     *
     * @param  array{method: string, amount: float, reference?: string|null}  $data
     */
    public function pay(Purchase $purchase, User $by, array $data): SupplierPayment
    {
        return DB::transaction(function () use ($purchase, $by, $data) {
            $purchase = Purchase::lockForUpdate()->findOrFail($purchase->id);
            $balance = round((float) $purchase->total - (float) $purchase->amount_paid, 2);
            $amount = round((float) $data['amount'], 2);

            if ($amount > $balance) {
                throw ValidationException::withMessages(['amount' => 'El pago es mayor al saldo de la compra ($'.number_format($balance, 2).').']);
            }

            $shiftId = null;
            if ($data['method'] === 'cash') {
                $shift = $this->cash->current($by);
                if (! $shift) {
                    throw ValidationException::withMessages(['method' => 'Para pagar en efectivo abre tu turno de caja, o paga por transferencia.']);
                }
                $shiftId = $shift->id;
            }

            $payment = SupplierPayment::create([
                'purchase_id' => $purchase->id,
                'user_id' => $by->id,
                'cash_shift_id' => $shiftId,
                'method' => $data['method'],
                'amount' => $amount,
                'reference' => $data['reference'] ?? null,
            ]);

            $paid = round((float) $purchase->amount_paid + $amount, 2);
            $purchase->forceFill([
                'amount_paid' => $paid,
                'payment_status' => $paid >= (float) $purchase->total ? 'paid' : 'partial',
            ])->save();

            $this->audit->log('purchasing', 'supplier_paid', "Pago de \${$amount} a la compra {$purchase->folio}", $by->id, 'purchases', $purchase->id);

            return $payment;
        });
    }

    /** Si la factura trae otro costo, se actualiza el producto y queda en el historial (AD4). */
    private function updateCost(int $productId, float $cost, User $by, string $purchaseFolio): void
    {
        $product = Product::find($productId);

        if (abs((float) $product->purchase_price - $cost) < 0.01) {
            return;
        }

        PriceHistory::create([
            'product_id' => $product->id,
            'user_id' => $by->id,
            'old_purchase_price' => $product->purchase_price,
            'new_purchase_price' => $cost,
            'old_sale_price' => $product->sale_price,
            'new_sale_price' => $product->sale_price,
            'reason' => "Costo de la compra {$purchaseFolio}",
        ]);

        $product->forceFill(['purchase_price' => $cost])->save();
    }

    private function refreshEstimate(PurchaseOrder $order): void
    {
        $order->forceFill(['estimated_total' => round((float) $order->purchaseOrderItems()->sum(DB::raw('quantity * unit_cost')), 2)])->save();
    }

    /** @param  array<int, string>  $statuses */
    private function expectOrder(PurchaseOrder $order, array $statuses, string $message): void
    {
        if (! in_array($order->status, $statuses, true)) {
            throw ValidationException::withMessages(['status' => $message]);
        }
    }
}
