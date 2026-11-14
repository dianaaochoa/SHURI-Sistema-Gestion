<?php

namespace App\Services\Pos;

use App\Models\OrderStatus;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Models\Warranty;
use App\Services\AuditService;
use App\Services\Cash\CashShiftService;
use App\Services\FolioService;
use App\Services\Inventory\InventoryService;
use App\Services\SettingsService;
use App\Services\Workshop\ServiceOrderService;
use App\Services\Workshop\WarrantyService;
use App\Support\OrderBalance;
use App\Support\OrderStatusFlow;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Punto de venta (C2) y entrega de equipos (C6): RF-08, RF-14, RNF-04.
 * Un cobro es una sola transacción: venta, renglones, pagos, salida de
 * inventario y entrega de órdenes. Si algo falla, no queda nada a medias.
 */
class SaleService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly CashShiftService $cash,
        private readonly FolioService $folios,
        private readonly SettingsService $settings,
        private readonly AuditService $audit,
        private readonly WarrantyService $warranties,
    ) {}

    /** @param  array<string, mixed>  $data  validado por CheckoutRequest */
    public function checkout(User $cashier, array $data): Sale
    {
        $shift = $this->cash->current($cashier);

        if (! $shift) {
            throw ValidationException::withMessages(['cash_shift' => 'Abre tu turno de caja antes de cobrar.']);
        }

        return DB::transaction(function () use ($cashier, $data, $shift) {
            $lines = $this->buildLines($cashier, $data['items']);
            $authorizer = $this->checkDiscount($cashier, $lines, $data['authorization'] ?? null);
            $totals = $this->totals($lines);
            $payments = $this->checkPayments($data['payments'] ?? [], $totals['total']);

            $sale = Sale::create([
                'folio' => $this->folios->next('sale'),
                'cash_shift_id' => $shift->id,
                'cash_register_id' => $shift->cash_register_id,
                'cashier_id' => $cashier->id,
                'customer_id' => $data['customer_id'] ?? $this->customerFromOrders($lines),
                'authorized_by' => $authorizer?->id,
                'subtotal' => $totals['subtotal'],
                'discount' => $totals['discount'],
                'tax' => $totals['tax'],
                'status' => 'paid',
                'receipt_type' => 'ticket',
                'paid_at' => now(),
            ]);

            foreach ($lines as $line) {
                SaleItem::create([
                    'sale_id' => $sale->id,
                    'type' => $line['type'],
                    'product_id' => $line['product']?->id,
                    'service_order_id' => $line['order']?->id,
                    'description' => $line['description'],
                    'quantity' => $line['quantity'],
                    'unit_price' => $line['unit_price'],
                    'discount_pct' => $line['discount_pct'],
                    'discount_amount' => $line['discount_amount'],
                    'subtotal' => $line['subtotal'],
                ]);
            }

            foreach ($payments as $payment) {
                Payment::create(['sale_id' => $sale->id, 'cash_shift_id' => $shift->id] + $payment);
            }

            // Salida de inventario: si no alcanza el stock, se revierte todo el cobro (RF-02, RNF-04)
            foreach ($lines as $line) {
                if ($line['type'] === 'service_order') {
                    $this->deliver($line['order'], $cashier, $line['picked_up_by_name']);

                    continue;
                }

                // Costo extra de una garantía: al cobrarse, el equipo se entrega (RF-11)
                if ($line['type'] === 'additional_charge') {
                    $this->warranties->markDelivered($line['warranty'], $cashier);

                    continue;
                }

                $this->inventory->move($line['product']->id, 'sale', -$line['quantity'], $cashier,
                    "Venta {$sale->folio}", ['sale_id' => $sale->id], $authorizer);
            }

            $this->audit->log('pos', 'sale_paid', "Venta {$sale->folio} por \${$totals['total']}", $cashier->id, 'sales', $sale->id);

            if ($authorizer) {
                $this->audit->log('pos', 'discount_authorized',
                    "{$authorizer->name} autorizó un descuento de {$this->maxDiscount($lines)}% en la venta {$sale->folio}",
                    $authorizer->id, 'sales', $sale->id);
            }

            // refresh(): `total` es una columna calculada por MySQL y no viene en el modelo recién creado
            return $sale->refresh()->load(['saleItems', 'payments', 'cashier', 'customer', 'authorizedBy']);
        });
    }

    /**
     * Arma los renglones con precios del catálogo o saldos de las órdenes;
     * nunca confía en precios que mande el cliente.
     *
     * @param  array<int, array<string, mixed>>  $items
     * @return array<int, array<string, mixed>>
     */
    private function buildLines(User $cashier, array $items): array
    {
        $lines = [];
        $orderIds = [];
        $warrantyIds = [];

        foreach ($items as $i => $item) {
            if ($item['type'] === 'product') {
                $product = Product::where('is_active', true)->find($item['product_id']);

                if (! $product || ! $product->sellable_at_counter) {
                    throw ValidationException::withMessages(["items.{$i}.product_id" => 'El producto no existe o no se vende en mostrador.']);
                }

                $quantity = (int) ($item['quantity'] ?? 1);
                $pct = round((float) ($item['discount_pct'] ?? 0), 2);
                $gross = round((float) $product->sale_price * $quantity, 2);
                $discount = round($gross * $pct / 100, 2);

                $lines[] = [
                    'type' => 'product', 'product' => $product, 'order' => null,
                    'description' => $product->name, 'quantity' => $quantity,
                    'unit_price' => (float) $product->sale_price, 'gross' => $gross,
                    'discount_pct' => $pct, 'discount_amount' => $discount, 'subtotal' => round($gross - $discount, 2),
                    'picked_up_by_name' => null,
                ];

                continue;
            }

            // Órdenes y garantías se entregan: hace falta el permiso de entregar equipos
            if (! $cashier->hasPermission('orders.deliver')) {
                throw new HttpResponseException(response()->json([
                    'message' => 'No tienes permiso para entregar equipos.', 'code' => 'FORBIDDEN',
                ], 403));
            }

            // Costo extra de una garantía "procede con costo" ya reparada (RF-11)
            if ($item['type'] === 'warranty') {
                $warranty = Warranty::with('serviceOrder.device')->where('folio', $item['folio'])->lockForUpdate()->first();

                if (! $warranty || $warranty->status !== 'finished' || (float) $warranty->extra_cost <= 0) {
                    throw ValidationException::withMessages([
                        "items.{$i}.folio" => "La garantía {$item['folio']} no tiene un costo extra por cobrar.",
                    ]);
                }
                if (in_array($warranty->id, $warrantyIds, true)) {
                    throw ValidationException::withMessages(["items.{$i}.folio" => "La garantía {$warranty->folio} ya está en el ticket."]);
                }
                $warrantyIds[] = $warranty->id;

                $cost = (float) $warranty->extra_cost;
                $lines[] = [
                    'type' => 'additional_charge', 'product' => null, 'order' => $warranty->serviceOrder,
                    'description' => "Garantía {$warranty->folio} · costo extra",
                    'quantity' => 1, 'unit_price' => $cost, 'gross' => $cost,
                    'discount_pct' => 0.0, 'discount_amount' => 0.0, 'subtotal' => $cost,
                    'picked_up_by_name' => null, 'warranty' => $warranty,
                ];

                continue;
            }

            // Liquidación de una orden de taller (C6)

            $order = ServiceOrder::with(['status', 'device'])->where('folio', $item['folio'])->lockForUpdate()->first();

            if (! $order) {
                throw ValidationException::withMessages(["items.{$i}.folio" => "No existe la orden {$item['folio']}."]);
            }
            if (in_array($order->id, $orderIds, true)) {
                throw ValidationException::withMessages(["items.{$i}.folio" => "La orden {$order->folio} ya está en el ticket."]);
            }
            if ($order->is_paid || ! in_array($order->status->code, OrderBalance::DELIVERABLE, true)) {
                throw ValidationException::withMessages([
                    "items.{$i}.folio" => "La orden {$order->folio} está «{$order->status->name}» y no se puede entregar.",
                ]);
            }

            $orderIds[] = $order->id;
            $due = OrderBalance::for($order)['amount_due'];

            $lines[] = [
                'type' => 'service_order', 'product' => null, 'order' => $order,
                'description' => "Orden {$order->folio} · ".ServiceOrderService::deviceLabel($order->device),
                'quantity' => 1, 'unit_price' => $due, 'gross' => $due,
                'discount_pct' => 0.0, 'discount_amount' => 0.0, 'subtotal' => $due,
                'picked_up_by_name' => $item['picked_up_by_name'] ?? null,
            ];
        }

        return $lines;
    }

    /**
     * RF-14: cada usuario tiene un descuento máximo; si lo supera, necesita
     * el usuario y la clave de autorización de un superior.
     *
     * @param  array<int, array<string, mixed>>  $lines
     * @param  array{username?: string, code?: string}|null  $authorization
     */
    private function checkDiscount(User $cashier, array $lines, ?array $authorization): ?User
    {
        $requested = $this->maxDiscount($lines);

        if ($requested <= 0) {
            return null;
        }

        if (! $cashier->hasPermission('pos.discount')) {
            throw ValidationException::withMessages(['items' => 'No tienes permiso para aplicar descuentos.']);
        }

        $own = (float) $cashier->max_discount_pct;

        if ($requested <= $own) {
            return null;
        }

        if (empty($authorization['username']) || empty($authorization['code'])) {
            throw ValidationException::withMessages([
                'authorization' => "El descuento de {$requested}% supera tu máximo ({$own}%). Pide la clave de autorización de un superior.",
            ]);
        }

        $superior = User::where('username', mb_strtolower(trim($authorization['username'])))->where('is_active', true)->first();

        $valid = $superior
            && $superior->id !== $cashier->id
            && $superior->hasPermission('pos.discount')
            && (float) $superior->max_discount_pct >= $requested
            && $superior->authorization_code
            && Hash::check($authorization['code'], $superior->authorization_code);

        if (! $valid) {
            throw ValidationException::withMessages([
                'authorization' => 'La clave de autorización no es válida o esa persona no puede autorizar ese descuento.',
            ]);
        }

        return $superior;
    }

    /**
     * Totales con IVA. Si los precios ya incluyen IVA (setting prices_include_tax),
     * el IVA se desglosa del total; si no, se suma.
     *
     * @param  array<int, array<string, mixed>>  $lines
     * @return array{subtotal: float, discount: float, tax: float, total: float}
     */
    private function totals(array $lines): array
    {
        $gross = round(array_sum(array_column($lines, 'gross')), 2);
        $discount = round(array_sum(array_column($lines, 'discount_amount')), 2);
        $rate = (float) $this->settings->get('tax_rate', 16) / 100;

        if ($this->settings->get('prices_include_tax', true)) {
            $total = round($gross - $discount, 2);
            $net = round($total / (1 + $rate), 2);
            $subtotal = round($gross / (1 + $rate), 2);

            // subtotal − descuento + IVA = total, sin errores de redondeo
            return ['subtotal' => $subtotal, 'discount' => round($subtotal - $net, 2), 'tax' => round($total - $net, 2), 'total' => $total];
        }

        $tax = round(($gross - $discount) * $rate, 2);

        return ['subtotal' => $gross, 'discount' => $discount, 'tax' => $tax, 'total' => round($gross - $discount + $tax, 2)];
    }

    /**
     * Los pagos deben cubrir exactamente el total. En efectivo se calcula el cambio.
     *
     * @param  array<int, array<string, mixed>>  $payments
     * @return array<int, array<string, mixed>>
     */
    private function checkPayments(array $payments, float $total): array
    {
        if (count($payments) > 1 && ! $this->settings->get('mixed_payments_enabled', true)) {
            throw ValidationException::withMessages(['payments' => 'El pago mixto está desactivado.']);
        }

        $rows = [];
        foreach ($payments as $i => $payment) {
            $method = $payment['method'];

            if (($method === 'card' && ! $this->settings->get('card_payments_enabled', true))
                || ($method === 'transfer' && ! $this->settings->get('transfer_payments_enabled', true))) {
                throw ValidationException::withMessages(["payments.{$i}.method" => 'Esa forma de pago está desactivada.']);
            }

            $amount = round((float) $payment['amount'], 2);
            $received = $method === 'cash' ? round((float) ($payment['amount_received'] ?? $amount), 2) : null;

            if ($received !== null && $received < $amount) {
                throw ValidationException::withMessages(["payments.{$i}.amount_received" => 'El efectivo recibido no alcanza para ese pago.']);
            }

            $rows[] = [
                'method' => $method,
                'amount' => $amount,
                'amount_received' => $received,
                'change_given' => $received !== null ? round($received - $amount, 2) : null,
                'reference' => $payment['reference'] ?? null,
                'card_last4' => $payment['card_last4'] ?? null,
            ];
        }

        $paid = round(array_sum(array_column($rows, 'amount')), 2);

        if (abs($paid - $total) >= 0.01) {
            throw ValidationException::withMessages([
                'payments' => 'Los pagos ($'.number_format($paid, 2).') no cubren el total ($'.number_format($total, 2).').',
            ]);
        }

        return $rows;
    }

    /** RF-08: la orden queda pagada y pasa a Entregado (el trigger calcula la garantía). */
    private function deliver(ServiceOrder $order, User $cashier, ?string $pickedUpBy): void
    {
        OrderStatusFlow::assert($order->status->code, OrderStatus::DELIVERED, $order->status->name);

        $order->forceFill([
            'is_paid' => true,
            'delivered_by' => $cashier->id,
            'picked_up_by_name' => $pickedUpBy,
            'status_id' => OrderStatus::idFor(OrderStatus::DELIVERED),
            'updated_by' => $cashier->id,
        ])->save(); // ServiceOrderObserver registra el cambio de estado en la bitácora
    }

    /** @param  array<int, array<string, mixed>>  $lines */
    private function maxDiscount(array $lines): float
    {
        return (float) max([0, ...array_column($lines, 'discount_pct')]);
    }

    /** @param  array<int, array<string, mixed>>  $lines */
    private function customerFromOrders(array $lines): ?int
    {
        foreach ($lines as $line) {
            if ($line['order']) {
                return $line['order']->customer_id;
            }
        }

        return null;
    }
}
