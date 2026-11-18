<?php

namespace App\Http\Resources;

use App\Models\User;
use App\Models\Warranty;
use App\Services\Workshop\ServiceOrderService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Garantía (C4, J4, T4 del personal y P3 del cliente). El reporte técnico
 * interno solo lo ve el personal; el cliente ve el dictamen y su motivo.
 *
 * @mixin Warranty
 */
class WarrantyResource extends JsonResource
{
    /** @var array<string, string> */
    private const STATUSES = [
        'requested' => 'Solicitada',
        'received' => 'Recibida',
        'in_review' => 'En revisión',
        'awaiting_ruling' => 'Por dictaminar',
        'approved' => 'Procede con costo · espera respuesta',
        'rejected' => 'No procede',
        'in_repair' => 'En reparación',
        'finished' => 'Lista para recoger',
        'delivered' => 'Entregada',
        'cancelled' => 'Cancelada',
    ];

    /** @var array<string, string> */
    private const RULINGS = [
        'covered' => 'Procede',
        'not_covered' => 'No procede',
        'covered_with_cost' => 'Procede con costo',
    ];

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $isStaff = $request->user() instanceof User;

        return [
            'folio' => $this->folio,
            'status' => $this->status,
            'status_name' => self::STATUSES[$this->status] ?? $this->status,
            'request_channel' => $this->request_channel,
            'customer_reason' => $this->customer_reason,
            'service_order' => $this->whenLoaded('serviceOrder', fn () => [
                'folio' => $this->serviceOrder->folio,
                'device' => $this->serviceOrder->relationLoaded('device') ? ServiceOrderService::deviceLabel($this->serviceOrder->device) : null,
                'warranty_until' => $this->serviceOrder->warranty_until?->toDateString(),
            ]),
            'technician' => $this->whenLoaded('technician', fn () => $this->technician?->name),
            'technician_review' => $this->when($isStaff, $this->technician_review),
            'ruling' => $this->ruling,
            'ruling_name' => $this->ruling ? self::RULINGS[$this->ruling] : null,
            'ruling_reason' => $this->ruling_reason,
            'extra_cost' => (float) $this->extra_cost,
            'extra_cost_accepted' => $this->extra_cost_accepted,
            'received_at' => $this->received_at?->toIso8601String(),
            'ruled_at' => $this->ruled_at?->toIso8601String(),
            'answered_at' => $this->answered_at?->toIso8601String(),
            'finished_at' => $this->finished_at?->toIso8601String(),
            'delivered_at' => $this->delivered_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
