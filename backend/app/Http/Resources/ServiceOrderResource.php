<?php

namespace App\Http\Resources;

use App\Models\ServiceOrder;
use App\Models\User;
use App\Services\Workshop\ServiceOrderService;
use App\Services\Workshop\StorageService;
use App\Support\OrderBalance;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Orden de servicio para las pantallas del personal (C4, J2, T2). El PIN del equipo
 * solo se devuelve a quien repara (permiso orders.repair).
 *
 * @mixin ServiceOrder
 */
class ServiceOrderResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $user = $request->user();
        $canRepair = $user instanceof User && $user->hasPermission('orders.repair');

        return [
            'id' => $this->id,
            'folio' => $this->folio,
            'status' => $this->whenLoaded('status', fn () => [
                'code' => $this->status->code,
                'name' => $this->status->name,
                'color' => $this->status->color_hex,
                'portal_step' => $this->status->portal_step,
            ]),
            'priority' => $this->priority,
            'customer' => $this->whenLoaded('customer', fn () => [
                'id' => $this->customer->id,
                'name' => $this->customer->name,
                'last_name' => $this->customer->last_name,
                'phone' => $this->customer->phone,
                'email' => $this->customer->email,
            ]),
            'device' => $this->whenLoaded('device', fn () => [
                'id' => $this->device->id,
                'type' => $this->device->type,
                'brand' => $this->device->brand,
                'model' => $this->device->model,
                'serial_number' => $this->device->serial_number,
                'color' => $this->device->color,
                'label' => ServiceOrderService::deviceLabel($this->device),
            ]),
            'reported_issue' => $this->reported_issue,
            'received_accessories' => $this->received_accessories,
            'physical_condition' => $this->physical_condition,
            'intake_checklist' => $this->intake_checklist,
            'has_device_pin' => $this->device_pin !== null,
            'device_pin' => $this->when($canRepair, fn () => $this->device_pin),
            'diagnosis' => $this->diagnosis,
            'failure_cause' => $this->failure_cause,
            'labor_level_id' => $this->labor_level_id,
            'estimated_minutes' => $this->estimated_minutes,
            'no_repair_reason' => $this->no_repair_reason,
            'technician' => $this->whenLoaded('technician', fn () => $this->technician
                ? ['id' => $this->technician->id, 'name' => $this->technician->name]
                : null),
            'received_by' => $this->whenLoaded('receivedBy', fn () => $this->receivedBy?->name),
            'is_paused' => $this->is_paused,
            'pause_reason' => $this->pause_reason,
            'estimated_cost' => (float) $this->estimated_cost,
            'deposit' => (float) $this->deposit,
            'total' => (float) $this->total,
            'is_paid' => (bool) $this->is_paid,
            // Saldo por cobrar al entregar (C6); solo aplica cuando el equipo espera recolección
            'balance' => $this->whenLoaded('status', fn () => in_array($this->status->code, app(StorageService::class)->deliverableStatuses(), true) && ! $this->is_paid
                ? OrderBalance::for($this->resource)
                : null),
            'promised_date' => $this->promised_date?->toDateString(),
            'diagnosis_due_at' => $this->diagnosis_due_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'assigned_at' => $this->assigned_at?->toIso8601String(),
            'ready_at' => $this->ready_at?->toIso8601String(),
            'delivered_at' => $this->delivered_at?->toIso8601String(),
            'labor_cost' => (float) $this->labor_cost,
            'parts_cost' => (float) $this->parts_cost,
            // Dónde está el equipo: taller, mostrador o bodega (J9, C4.7)
            'location' => $this->location,
            'sent_to_storage_at' => $this->sent_to_storage_at?->toIso8601String(),
            'storage_fee_waived' => (bool) $this->storage_fee_waived,
            'warranty_until' => $this->warranty_until?->toDateString(),
            'picked_up_by_name' => $this->picked_up_by_name,
            'delivered_by' => $this->whenLoaded('deliveredBy', fn () => $this->deliveredBy?->name),
            // Último presupuesto (inicial o adicional), con sus conceptos
            'quote' => $this->whenLoaded('quotes', fn () => ($q = $this->quotes->sortByDesc('id')->first()) ? [
                'folio' => $q->folio,
                'type' => $q->type,
                'status' => $q->status,
                'diagnosis' => $q->diagnosis,
                'is_urgent' => (bool) $q->is_urgent,
                'created_at' => $q->created_at?->toIso8601String(),
                'labor_amount' => (float) $q->labor_amount,
                'parts_amount' => (float) $q->parts_amount,
                'discount' => (float) $q->discount,
                'total' => (float) $q->total,
                'valid_until' => $q->valid_until?->toDateString(),
                'sent_at' => $q->sent_at?->toIso8601String(),
                'answered_at' => $q->answered_at?->toIso8601String(),
                'items' => $q->relationLoaded('quoteItems') ? $q->quoteItems->map(fn ($i) => [
                    'type' => $i->type,
                    'concept' => $i->concept,
                    'quantity' => $i->quantity,
                    'unit_price' => (float) $i->unit_price,
                ])->all() : [],
            ] : null),
            // Garantía más reciente (P3, C4.5, J4)
            'warranty' => $this->whenLoaded('warranties', fn () => ($w = $this->warranties->sortByDesc('id')->first()) ? [
                'folio' => $w->folio,
                'status' => $w->status,
                'request_channel' => $w->request_channel,
                'customer_reason' => $w->customer_reason,
                'ruling' => $w->ruling,
                'ruling_reason' => $w->ruling_reason,
                'extra_cost' => $w->extra_cost !== null ? (float) $w->extra_cost : null,
                'extra_cost_accepted' => $w->extra_cost_accepted,
                'created_at' => $w->created_at?->toIso8601String(),
                'received_at' => $w->received_at?->toIso8601String(),
                'ruled_at' => $w->ruled_at?->toIso8601String(),
                'finished_at' => $w->finished_at?->toIso8601String(),
            ] : null),
            // Cronómetro del banco (T3): minutos trabajados y, si corre, desde cuándo
            'timer' => $this->whenLoaded('orderTimeLogs', function () {
                $running = $this->orderTimeLogs->firstWhere('ends_at', null);

                return [
                    'running' => $running !== null,
                    'started_at' => $running?->starts_at?->toIso8601String(),
                    'worked_minutes' => (int) $this->orderTimeLogs->whereNotNull('ends_at')->sum('minutes'),
                ];
            }),
            // Bitácora: lo que vio el cliente y las notas internas, en orden
            'logs' => $this->whenLoaded('orderLogs', fn () => $this->orderLogs->sortBy('id')->map(fn ($l) => [
                'type' => $l->type,
                'description' => $l->description,
                'visible_to_customer' => (bool) $l->visible_to_customer,
                'user' => $l->user?->name,
                'created_at' => $l->created_at?->toIso8601String(),
            ])->values()->all()),
        ];
    }
}
