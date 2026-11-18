<?php

namespace App\Services\Workshop;

use App\Models\LaborLevel;
use App\Models\OrderStatus;
use App\Models\OrderTimeLog;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Repositories\Contracts\OrderRepositoryInterface;
use App\Support\OrderStatusFlow;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Banco de trabajo del técnico (T2/T3, RF-05): sus equipos asignados,
 * iniciar el trabajo, pausar/reanudar con cronómetro y registrar el diagnóstico.
 * La bitácora (cambio de estado, diagnóstico, pausa) la escribe ServiceOrderObserver.
 */
class WorkbenchService
{
    public function __construct(
        private readonly OrderRepositoryInterface $orders,
        private readonly QuoteService $quotes,
    ) {}

    /** @param  array<string, mixed>  $filters */
    public function myOrders(User $technician, array $filters): LengthAwarePaginator
    {
        return $this->orders->paginate(
            ['technician_id' => $technician->id] + $filters,
            (int) ($filters['per_page'] ?? 20),
        );
    }

    /** La orden solo se devuelve si está asignada a este técnico. */
    public function findMine(User $technician, string $folio): ?ServiceOrder
    {
        $order = $this->orders->findByFolio($folio);

        return $order && $order->technician_id === $technician->id ? $order : null;
    }

    /**
     * "Iniciar": la primera vez pasa de Asignado a En diagnóstico; en diagnóstico
     * o en reparación solo arranca el cronómetro.
     */
    public function start(ServiceOrder $order, User $technician): ServiceOrder
    {
        return $this->locked($order, function (ServiceOrder $order) use ($technician) {
            $code = $order->status->code;

            if ($code === OrderStatus::ASSIGNED) {
                $order->status_id = OrderStatus::idFor(OrderStatus::DIAGNOSING);
                $code = OrderStatus::DIAGNOSING;
            } elseif (! in_array($code, OrderStatusFlow::WORKING, true)) {
                throw ValidationException::withMessages([
                    'status' => "La orden está «{$order->status->name}» y no se puede trabajar en ella.",
                ]);
            }

            if ($order->is_paused) {
                throw ValidationException::withMessages(['status' => 'La orden está en pausa. Reanúdala para seguir.']);
            }

            $order->updated_by = $technician->id;
            $order->save();

            $this->startTimer($order, $technician, $code);
        });
    }

    public function pause(ServiceOrder $order, User $technician, string $reason): ServiceOrder
    {
        return $this->locked($order, function (ServiceOrder $order) use ($technician, $reason) {
            if (! in_array($order->status->code, OrderStatusFlow::WORKING, true)) {
                throw ValidationException::withMessages(['status' => 'Solo se puede pausar una orden en diagnóstico o en reparación.']);
            }
            if ($order->is_paused) {
                throw ValidationException::withMessages(['status' => 'La orden ya está en pausa.']);
            }

            $this->stopTimer($order, $reason);

            $order->forceFill(['is_paused' => true, 'pause_reason' => $reason, 'updated_by' => $technician->id])->save();
        });
    }

    public function resume(ServiceOrder $order, User $technician): ServiceOrder
    {
        return $this->locked($order, function (ServiceOrder $order) use ($technician) {
            if (! $order->is_paused) {
                throw ValidationException::withMessages(['status' => 'La orden no está en pausa.']);
            }

            $order->forceFill(['is_paused' => false, 'pause_reason' => null, 'updated_by' => $technician->id])->save();

            $this->startTimer($order, $technician, $order->status->code);
        });
    }

    /**
     * Diagnóstico (T3): con reparación pasa a En cotización (el jefe cotiza, RF-10);
     * sin reparación pasa a Sin reparación y queda listo para devolverse.
     *
     * @param  array<string, mixed>  $data
     */
    public function diagnose(ServiceOrder $order, User $technician, array $data): ServiceOrder
    {
        return $this->locked($order, function (ServiceOrder $order) use ($technician, $data) {
            $repairable = $data['outcome'] === 'repairable';
            $target = $repairable ? OrderStatus::QUOTING : OrderStatus::NOT_REPAIRABLE;

            OrderStatusFlow::assert($order->status->code, $target, $order->status->name);

            if ($repairable) {
                $level = LaborLevel::where('is_active', true)->find($data['labor_level_id']);
                if (! $level) {
                    throw ValidationException::withMessages(['labor_level_id' => 'El nivel de mano de obra no existe o está inactivo.']);
                }
            }

            $this->stopTimer($order);

            $order->forceFill([
                'diagnosis' => $data['diagnosis'],
                'failure_cause' => $data['failure_cause'] ?? null,
                'labor_level_id' => $repairable ? $data['labor_level_id'] : null,
                'estimated_minutes' => $repairable ? ($data['estimated_minutes'] ?? null) : null,
                'no_repair_reason' => $repairable ? null : $data['no_repair_reason'],
                'is_paused' => false,
                'pause_reason' => null,
                'status_id' => OrderStatus::idFor($target),
                'updated_by' => $technician->id,
            ])->save();

            // Con reparación, el diagnóstico deja el presupuesto "por cotizar" para el jefe (J3)
            if ($repairable) {
                $this->quotes->draftFromDiagnosis($order, $technician, $data);
            }
        });
    }

    /**
     * Cronómetro de la orden para la respuesta (T3).
     *
     * @return array{running: bool, started_at: ?string, worked_minutes: int}
     */
    public function timer(ServiceOrder $order): array
    {
        $logs = OrderTimeLog::where('service_order_id', $order->id)->get();
        $running = $logs->firstWhere('ends_at', null);

        $closedMinutes = (int) $logs->whereNotNull('ends_at')->sum('minutes');
        $runningMinutes = $running ? (int) $running->starts_at->diffInMinutes(now()) : 0;

        return [
            'running' => $running !== null,
            'started_at' => $running?->starts_at->toIso8601String(),
            'worked_minutes' => $closedMinutes + $runningMinutes,
        ];
    }

    /**
     * Ejecuta la acción con la orden bloqueada y devuelve la orden actualizada.
     *
     * @param  callable(ServiceOrder): void  $action
     */
    private function locked(ServiceOrder $order, callable $action): ServiceOrder
    {
        DB::transaction(function () use ($order, $action) {
            $action(ServiceOrder::with('status')->lockForUpdate()->findOrFail($order->id));
        });

        return $order->fresh(['status', 'customer', 'device', 'technician', 'receivedBy']);
    }

    /** Un técnico no trabaja dos órdenes a la vez (README §15.2, UNIQUE active_technician_id). */
    private function startTimer(ServiceOrder $order, User $technician, string $statusCode): void
    {
        $running = OrderTimeLog::with('serviceOrder:id,folio')
            ->where('technician_id', $technician->id)
            ->whereNull('ends_at')
            ->first();

        if ($running && $running->service_order_id === $order->id) {
            return; // ya corre en esta misma orden
        }

        if ($running) {
            throw ValidationException::withMessages([
                'status' => "Ya estás trabajando en la orden {$running->serviceOrder->folio}. Páusala antes de iniciar otra.",
            ]);
        }

        OrderTimeLog::create([
            'service_order_id' => $order->id,
            'technician_id' => $technician->id,
            'type' => $statusCode === OrderStatus::IN_REPAIR ? 'repair' : 'diagnosis',
            'starts_at' => now(),
        ]);
    }

    private function stopTimer(ServiceOrder $order, ?string $pauseReason = null): void
    {
        OrderTimeLog::where('service_order_id', $order->id)
            ->whereNull('ends_at')
            ->update(['ends_at' => now(), 'pause_reason' => $pauseReason]);
    }
}
