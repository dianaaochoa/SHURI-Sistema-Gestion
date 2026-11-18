<?php

namespace App\Http\Resources;

use App\Models\PartRequest;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Solicitud de refacción (T5 del técnico, J5 del jefe). Incluye el stock
 * actual de la pieza para saber si se puede entregar en ese momento.
 *
 * @mixin PartRequest
 */
class PartRequestResource extends JsonResource
{
    /** @var array<string, string> */
    private const STATUSES = [
        'pending' => 'Pendiente',
        'approved' => 'Aprobada',
        'delivered' => 'Entregada',
        'ordered' => 'Pedida al proveedor',
        'rejected' => 'Rechazada',
        'cancelled' => 'Cancelada',
    ];

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'folio' => $this->folio,
            'status' => $this->status,
            'status_name' => self::STATUSES[$this->status] ?? $this->status,
            'urgency' => $this->urgency,
            'description' => $this->description,
            'quantity' => $this->quantity,
            'notes' => $this->notes,
            'product' => $this->whenLoaded('product', fn () => $this->product ? [
                'id' => $this->product->id,
                'sku' => $this->product->sku,
                'name' => $this->product->name,
                'stock' => $this->product->stock,
                'can_deliver' => $this->product->stock >= $this->quantity,
            ] : null),
            'service_order' => $this->whenLoaded('serviceOrder', fn () => [
                'folio' => $this->serviceOrder->folio,
            ]),
            'technician' => $this->whenLoaded('technician', fn () => $this->technician?->name),
            'handled_by' => $this->whenLoaded('handledBy', fn () => $this->handledBy?->name),
            'handled_at' => $this->handled_at?->toIso8601String(),
            'rejection_reason' => $this->rejection_reason,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
