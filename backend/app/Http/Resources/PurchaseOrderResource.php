<?php

namespace App\Http\Resources;

use App\Models\PurchaseOrder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Pedido a proveedor (J5, AD5). Cada renglón dice cuánto falta por recibir.
 *
 * @mixin PurchaseOrder
 */
class PurchaseOrderResource extends JsonResource
{
    /** @var array<string, string> */
    private const STATUSES = [
        'draft' => 'Borrador',
        'sent' => 'Enviado',
        'partially_received' => 'Recibido en parte',
        'received' => 'Recibido',
        'cancelled' => 'Cancelado',
    ];

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'folio' => $this->folio,
            'status' => $this->status,
            'status_name' => self::STATUSES[$this->status] ?? $this->status,
            'supplier' => $this->whenLoaded('supplier', fn () => ['id' => $this->supplier->id, 'name' => $this->supplier->name]),
            'supplier_folio' => $this->supplier_folio,
            'expected_date' => $this->expected_date?->toDateString(),
            'payment_terms' => $this->payment_terms,
            'receive_at' => $this->receive_at,
            'notify_technician' => (bool) $this->notify_technician,
            'estimated_total' => (float) $this->estimated_total,
            'notes' => $this->notes,
            'items' => $this->whenLoaded('purchaseOrderItems', fn () => $this->purchaseOrderItems->map(fn ($item) => [
                'id' => $item->id,
                'product_id' => $item->product_id,
                'description' => $item->description,
                'quantity' => $item->quantity,
                'received_quantity' => $item->received_quantity,
                'pending_quantity' => $item->quantity - $item->received_quantity,
                'unit_cost' => (float) $item->unit_cost,
                'part_request_id' => $item->part_request_id,
                'service_order_id' => $item->service_order_id,
            ])->all()),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
