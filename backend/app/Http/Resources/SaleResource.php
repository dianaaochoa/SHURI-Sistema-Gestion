<?php

namespace App\Http\Resources;

use App\Models\Sale;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Venta / ticket (C2, C3, C11). Incluye renglones, pagos y el cambio entregado.
 *
 * @mixin Sale
 */
class SaleResource extends JsonResource
{
    /** @var array<string, string> */
    private const METHODS = ['cash' => 'Efectivo', 'card' => 'Tarjeta', 'transfer' => 'Transferencia', 'credit_note' => 'Nota de crédito'];

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'folio' => $this->folio,
            'status' => $this->status,
            'cashier' => $this->whenLoaded('cashier', fn () => $this->cashier?->name),
            'customer' => $this->whenLoaded('customer', fn () => $this->customer
                ? ['id' => $this->customer->id, 'name' => trim("{$this->customer->name} {$this->customer->last_name}")]
                : null),
            'authorized_by' => $this->whenLoaded('authorizedBy', fn () => $this->authorizedBy?->name),
            'subtotal' => (float) $this->subtotal,
            'discount' => (float) $this->discount,
            'tax' => (float) $this->tax,
            'total' => (float) $this->total,
            'items' => $this->whenLoaded('saleItems', fn () => $this->saleItems->map(fn ($item) => [
                'type' => $item->type,
                'description' => $item->description,
                'product_id' => $item->product_id,
                'service_order_id' => $item->service_order_id,
                'quantity' => $item->quantity,
                'unit_price' => (float) $item->unit_price,
                'discount_pct' => (float) $item->discount_pct,
                'discount_amount' => (float) $item->discount_amount,
                'subtotal' => (float) $item->subtotal,
            ])),
            'payments' => $this->whenLoaded('payments', fn () => $this->payments->map(fn ($p) => [
                'method' => $p->method,
                'method_name' => self::METHODS[$p->method] ?? $p->method,
                'amount' => (float) $p->amount,
                'amount_received' => $p->amount_received !== null ? (float) $p->amount_received : null,
                'change_given' => $p->change_given !== null ? (float) $p->change_given : null,
                'card_last4' => $p->card_last4,
                'reference' => $p->reference,
            ])),
            'change' => $this->whenLoaded('payments', fn () => (float) $this->payments->sum('change_given')),
            'paid_at' => $this->paid_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
