<?php

namespace App\Http\Resources;

use App\Models\ServiceOrder;
use App\Models\User;
use App\Services\Workshop\ServiceOrderService;
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
            'balance' => $this->whenLoaded('status', fn () => in_array($this->status->code, OrderBalance::DELIVERABLE, true) && ! $this->is_paid
                ? OrderBalance::for($this->resource)
                : null),
            'promised_date' => $this->promised_date?->toDateString(),
            'diagnosis_due_at' => $this->diagnosis_due_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'assigned_at' => $this->assigned_at?->toIso8601String(),
            'ready_at' => $this->ready_at?->toIso8601String(),
            'delivered_at' => $this->delivered_at?->toIso8601String(),
        ];
    }
}
