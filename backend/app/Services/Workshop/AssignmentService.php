<?php

namespace App\Services\Workshop;

use App\Models\OrderLog;
use App\Models\OrderStatus;
use App\Models\ServiceOrder;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * El jefe de técnicos asigna órdenes a los técnicos (J2, RF-04).
 * La bitácora (asignación + cambio de estado) la escribe ServiceOrderObserver.
 */
class AssignmentService
{
    /** Estados en los que el equipo ya no está en el flujo del taller. */
    private const CLOSED = [OrderStatus::ABANDONED];

    /**
     * Técnicos activos con su carga de trabajo actual (modal de asignar en J2, J7).
     *
     * @return Collection<int, object>
     */
    public function technicians(): Collection
    {
        return DB::table('v_technician_workload')
            ->orderBy('active_orders')
            ->orderBy('technician')
            ->get()
            ->map(fn ($row) => (object) [
                'id' => (int) $row->technician_id,
                'name' => $row->technician,
                'specialty' => $row->specialty,
                'active_orders' => (int) $row->active_orders,
                'priority_orders' => (int) $row->priority_orders,
                'diagnosing' => (int) $row->diagnosing,
                'paused' => (int) $row->paused,
            ]);
    }

    /**
     * @param  string|null  $promisedDate  fecha prometida al cliente (J2.2)
     * @param  string|null  $notes  nota interna para el técnico (no la ve el cliente)
     */
    public function assign(ServiceOrder $order, int $technicianId, User $by, ?string $priority = null, ?string $promisedDate = null, ?string $notes = null): ServiceOrder
    {
        $technician = User::where('is_active', true)->find($technicianId);

        if (! $technician || ! $technician->hasPermission('orders.repair')) {
            throw ValidationException::withMessages([
                'technician_id' => 'Solo puedes asignar la orden a un técnico activo.',
            ]);
        }

        DB::transaction(function () use ($order, $technician, $by, $priority, $promisedDate, $notes) {
            // Bloquea la fila: dos jefes asignando al mismo tiempo no pueden dejarla a medias
            $order = ServiceOrder::with('status')->lockForUpdate()->findOrFail($order->id);
            $status = $order->status;

            if ($status->is_final || $status->awaiting_pickup || in_array($status->code, self::CLOSED, true)) {
                throw ValidationException::withMessages([
                    'folio' => "La orden {$order->folio} está «{$status->name}» y ya no se puede asignar.",
                ]);
            }

            if ($order->technician_id === $technician->id) {
                throw ValidationException::withMessages([
                    'technician_id' => "La orden ya está asignada a {$technician->name}.",
                ]);
            }

            $order->technician_id = $technician->id;
            $order->assigned_by = $by->id;
            $order->updated_by = $by->id;

            if ($priority) {
                $order->priority = $priority;
            }

            if ($promisedDate) {
                $order->promised_date = $promisedDate;
            }

            // La primera asignación la avanza; una reasignación conserva la etapa actual
            if ($status->code === OrderStatus::RECEIVED) {
                $order->status_id = OrderStatus::idFor(OrderStatus::ASSIGNED);
            }

            $order->save(); // ServiceOrderObserver escribe "assignment" y "status_change"

            if (filled($notes)) {
                $this->note($order, $by, $notes);
            }
        });

        return $order->fresh(['status', 'customer', 'device', 'technician', 'receivedBy']);
    }

    /** J2.3 Cambiar la prioridad de una orden que sigue en el taller. */
    public function changePriority(ServiceOrder $order, string $priority, User $by): ServiceOrder
    {
        if ($order->status->is_final || in_array($order->status->code, self::CLOSED, true)) {
            throw ValidationException::withMessages(['priority' => "La orden {$order->folio} ya salió del taller."]);
        }
        if ($order->priority === $priority) {
            throw ValidationException::withMessages(['priority' => 'La orden ya tiene esa prioridad.']);
        }

        $names = ['low' => 'Baja', 'normal' => 'Normal', 'high' => 'Alta', 'urgent' => 'Urgente'];

        DB::transaction(function () use ($order, $priority, $by, $names) {
            $previous = $names[$order->priority] ?? $order->priority;
            $order->forceFill(['priority' => $priority, 'updated_by' => $by->id])->save();
            $this->note($order, $by, "Prioridad cambiada de {$previous} a {$names[$priority]}.");
        });

        return $order;
    }

    /** Nota interna en la bitácora (la ve el taller, no el cliente). */
    public function note(ServiceOrder $order, User $by, string $text): OrderLog
    {
        return OrderLog::create([
            'service_order_id' => $order->id,
            'user_id' => $by->id,
            'type' => 'note',
            'description' => trim($text),
            'visible_to_customer' => false,
        ]);
    }

    /**
     * Contadores para el tablero del jefe de técnicos (J1/J2).
     *
     * @return array<string, mixed>
     */
    public function board(): array
    {
        $byStatus = ServiceOrder::query()
            ->join('order_statuses as s', 's.id', '=', 'service_orders.status_id')
            ->where('s.is_final', false)
            ->groupBy('s.code', 's.name', 's.color_hex', 's.sort_order')
            ->orderBy('s.sort_order')
            ->get(['s.code', 's.name', 's.color_hex as color', DB::raw('COUNT(*) as total')])
            ->map(fn ($row) => ['code' => $row->code, 'name' => $row->name, 'color' => $row->color, 'total' => (int) $row->total]);

        $active = fn () => ServiceOrder::whereHas('status', fn ($s) => $s->where('is_final', false)
            ->where('awaiting_pickup', false)
            ->where('code', '<>', OrderStatus::ABANDONED));

        return [
            'by_status' => $byStatus->values(),
            'unassigned' => $active()->whereNull('technician_id')->count(),
            'urgent' => $active()->whereIn('priority', ['high', 'urgent'])->count(),
            // Órdenes que pasaron el plazo de diagnóstico (setting diagnosis_sla_hours)
            'diagnosis_overdue' => ServiceOrder::whereHas('status', fn ($s) => $s->whereIn('code', [
                OrderStatus::RECEIVED, OrderStatus::ASSIGNED, OrderStatus::DIAGNOSING,
            ]))->where('diagnosis_due_at', '<', now())->count(),
        ];
    }
}
