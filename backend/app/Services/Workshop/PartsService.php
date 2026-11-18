<?php

namespace App\Services\Workshop;

use App\Models\OrderLog;
use App\Models\OrderPart;
use App\Models\OrderStatus;
use App\Models\PartRequest;
use App\Models\PartReturn;
use App\Models\Product;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Notifications\PartRequestedNotification;
use App\Services\FolioService;
use App\Services\Inventory\InventoryService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;

/**
 * Refacciones del taller (T5, J5 · RF-05):
 *  - El técnico pide la pieza para una orden suya; el jefe la entrega o la rechaza.
 *  - Al entregarla sale del stock (workshop_use) y queda ligada a la orden (order_parts).
 *  - Lo que no se usó se devuelve; si está en buen estado regresa al stock (workshop_return).
 * Todo movimiento de stock pasa por InventoryService (bloqueo de fila y kardex).
 */
class PartsService
{
    /** Estados en los que el técnico puede pedir piezas para la orden. */
    private const WORKING = [
        OrderStatus::DIAGNOSING,
        OrderStatus::AWAITING_CUSTOMER,
        OrderStatus::QUOTING,
        OrderStatus::QUOTE_PENDING,
        OrderStatus::IN_REPAIR,
    ];

    public function __construct(
        private readonly InventoryService $inventory,
        private readonly FolioService $folios,
    ) {}

    /**
     * T5: el técnico pide una pieza del catálogo o, si no existe, la describe.
     *
     * @param  array<string, mixed>  $data
     */
    public function request(ServiceOrder $order, User $technician, array $data): PartRequest
    {
        $order->loadMissing('status');

        if (! in_array($order->status->code, self::WORKING, true)) {
            throw ValidationException::withMessages([
                'status' => "La orden está «{$order->status->name}»; ya no se pueden pedir refacciones.",
            ]);
        }

        $product = null;
        if (! empty($data['product_id'])) {
            $product = Product::where('is_active', true)->where('usable_in_workshop', true)->find($data['product_id']);

            if (! $product) {
                throw ValidationException::withMessages(['product_id' => 'La refacción no existe o no se usa en el taller.']);
            }
        }

        $request = PartRequest::create([
            'folio' => $this->folios->next('part_request'),
            'service_order_id' => $order->id,
            'technician_id' => $technician->id,
            'product_id' => $product?->id,
            'description' => $product?->name ?? $data['description'],
            'quantity' => (int) ($data['quantity'] ?? 1),
            'urgency' => $data['urgency'] ?? 'normal',
            'notes' => $data['notes'] ?? null,
            'status' => 'pending',
        ]);

        $this->log($order, $technician, "Solicitó {$request->quantity} × {$request->description} ({$request->folio}).");

        Notification::send($this->handlers(), new PartRequestedNotification($request->load('serviceOrder')));

        return $request->load(['product', 'serviceOrder', 'technician']);
    }

    /** El técnico cancela una solicitud suya que el jefe aún no atiende. */
    public function cancel(PartRequest $request, User $technician): PartRequest
    {
        if ($request->technician_id !== $technician->id || $request->status !== 'pending') {
            throw ValidationException::withMessages(['status' => 'Solo puedes cancelar tus solicitudes pendientes.']);
        }

        $request->forceFill(['status' => 'cancelled'])->save();

        return $request->load(['product', 'serviceOrder', 'technician']);
    }

    /**
     * J5: el jefe entrega la pieza. Sale del stock y queda ligada a la orden.
     * Si no hay existencias, InventoryService rechaza todo (INSUFFICIENT_STOCK).
     */
    public function deliver(PartRequest $request, User $head, ?int $productId = null): PartRequest
    {
        DB::transaction(function () use ($request, $head, $productId) {
            $request = PartRequest::with('serviceOrder')->lockForUpdate()->findOrFail($request->id);

            if ($request->status !== 'pending') {
                throw ValidationException::withMessages(['status' => 'Esta solicitud ya fue atendida.']);
            }

            // Si el técnico solo describió la pieza, el jefe elige la del catálogo al entregarla
            $product = Product::where('is_active', true)->find($productId ?? $request->product_id);
            if (! $product) {
                throw ValidationException::withMessages([
                    'product_id' => 'Elige la refacción del catálogo que vas a entregar.',
                ]);
            }

            $order = $request->serviceOrder;

            $this->inventory->move($product->id, 'workshop_use', -$request->quantity, $head,
                "Solicitud {$request->folio} · Orden {$order->folio}", ['service_order_id' => $order->id]);

            OrderPart::create([
                'service_order_id' => $order->id,
                'product_id' => $product->id,
                'technician_id' => $request->technician_id,
                'part_request_id' => $request->id,
                'status' => 'used',
                'quantity' => $request->quantity,
                'unit_price' => $product->sale_price,
                'subtotal' => round((float) $product->sale_price * $request->quantity, 2),
            ]);

            $request->forceFill([
                'product_id' => $product->id,
                'status' => 'delivered',
                'handled_by' => $head->id,
                'handled_at' => now(),
            ])->save();

            $this->log($order, $head, "Entregó {$request->quantity} × {$product->name} ({$request->folio}).");
        });

        return $request->fresh(['product', 'serviceOrder', 'technician', 'handledBy']);
    }

    public function reject(PartRequest $request, User $head, string $reason): PartRequest
    {
        if ($request->status !== 'pending') {
            throw ValidationException::withMessages(['status' => 'Esta solicitud ya fue atendida.']);
        }

        $request->forceFill([
            'status' => 'rejected',
            'rejection_reason' => $reason,
            'handled_by' => $head->id,
            'handled_at' => now(),
        ])->save();

        $this->log($request->serviceOrder, $head, "Rechazó la solicitud {$request->folio}: {$reason}");

        return $request->load(['product', 'serviceOrder', 'technician', 'handledBy']);
    }

    /**
     * T5: el técnico devuelve piezas que no usó. El jefe la recibe después.
     *
     * @param  array<string, mixed>  $data
     */
    public function returnPart(OrderPart $part, User $technician, array $data): PartReturn
    {
        if ($part->technician_id !== $technician->id) {
            throw ValidationException::withMessages(['order_part' => 'Solo puedes devolver piezas que te entregaron a ti.']);
        }

        $pending = (int) $part->partReturns()->where('status', 'pending')->sum('quantity');
        $available = $part->quantity - $part->returned_quantity - $pending;
        $quantity = (int) $data['quantity'];

        if ($quantity > $available) {
            throw ValidationException::withMessages([
                'quantity' => "Solo puedes devolver {$available} pieza(s) de esta refacción.",
            ]);
        }

        return PartReturn::create([
            'order_part_id' => $part->id,
            'technician_id' => $technician->id,
            'quantity' => $quantity,
            'reason' => $data['reason'],
            'condition' => $data['condition'] ?? null,
            'status' => 'pending',
        ])->load('orderPart.product', 'orderPart.serviceOrder');
    }

    /**
     * J5: el jefe recibe la devolución. Si la pieza sirve, regresa al stock.
     *
     * @param  array{condition: string, returns_to_stock?: bool}  $data
     */
    public function receiveReturn(PartReturn $return, User $head, array $data): PartReturn
    {
        DB::transaction(function () use ($return, $head, $data) {
            $return = PartReturn::with('orderPart.serviceOrder', 'orderPart.product')->lockForUpdate()->findOrFail($return->id);

            if ($return->status !== 'pending') {
                throw ValidationException::withMessages(['status' => 'Esta devolución ya fue recibida.']);
            }

            // Una pieza dañada nunca regresa al stock
            $toStock = $data['condition'] !== 'damaged' && ($data['returns_to_stock'] ?? true);
            $part = $return->orderPart;

            if ($toStock) {
                $this->inventory->move($part->product_id, 'workshop_return', $return->quantity, $head,
                    "Devolución de la orden {$part->serviceOrder->folio}", ['service_order_id' => $part->service_order_id]);
            }

            $part->increment('returned_quantity', $return->quantity);

            $return->forceFill([
                'status' => 'received',
                'condition' => $data['condition'],
                'returns_to_stock' => $toStock,
                'received_by' => $head->id,
                'received_at' => now(),
            ])->save();

            $this->log($part->serviceOrder, $head, "Recibió la devolución de {$return->quantity} × {$part->product->name}"
                .($toStock ? ' (regresó al stock).' : ' (no regresó al stock).'));
        });

        return $return->fresh(['orderPart.product', 'orderPart.serviceOrder', 'receivedBy']);
    }

    /** Quienes atienden las solicitudes (permiso parts.handle). */
    private function handlers()
    {
        return User::where('is_active', true)
            ->whereHas('role.permissions', fn ($q) => $q->where('code', 'parts.handle'))
            ->get();
    }

    /** Bitácora interna de la orden (no visible para el cliente). */
    private function log(ServiceOrder $order, User $user, string $description): void
    {
        OrderLog::create([
            'service_order_id' => $order->id,
            'user_id' => $user->id,
            'type' => 'part',
            'description' => $description,
            'visible_to_customer' => false,
        ]);
    }
}
