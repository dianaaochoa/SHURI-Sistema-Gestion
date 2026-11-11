<?php

namespace App\Observers;

use App\Models\OrderLog;
use App\Models\OrderStatus;
use App\Models\ServiceOrder;
use App\Models\User;
use Illuminate\Support\Facades\Auth;

/**
 * Patrón Observer (README §8.3): cada cambio importante de una orden de servicio
 * se escribe automáticamente en la bitácora inmutable (order_logs),
 * así ningún controlador puede olvidarlo. La línea de tiempo del portal (P2) lee estas filas.
 */
class ServiceOrderObserver
{
    public function created(ServiceOrder $order): void
    {
        $this->log($order, 'intake', "Equipo recibido en sucursal con folio {$order->folio}.", visible: true,
            newStatusId: $order->status_id);
    }

    public function updated(ServiceOrder $order): void
    {
        if ($order->wasChanged('technician_id') && $order->technician_id) {
            $name = $order->technician()->value('name');
            $this->log($order, 'assignment', "Orden asignada a {$name}.");
        }

        if ($order->wasChanged('status_id')) {
            $status = OrderStatus::find($order->status_id);
            $this->log($order, 'status_change', "Estado cambiado a «{$status?->name}».", visible: true,
                previousStatusId: $order->getOriginal('status_id'), newStatusId: $order->status_id);
        }

        if ($order->wasChanged('diagnosis') && filled($order->diagnosis)) {
            $this->log($order, 'diagnosis', 'Diagnóstico registrado: '.$order->diagnosis);
        }

        if ($order->wasChanged('is_paused')) {
            $order->is_paused
                ? $this->log($order, 'pause', 'Trabajo en pausa: '.($order->pause_reason ?: 'sin motivo'))
                : $this->log($order, 'resume', 'Trabajo reanudado.');
        }
    }

    private function log(
        ServiceOrder $order,
        string $type,
        string $description,
        bool $visible = false,
        ?int $previousStatusId = null,
        ?int $newStatusId = null,
    ): void {
        $user = Auth::user();

        OrderLog::create([
            'service_order_id' => $order->id,
            'user_id' => $user instanceof User ? $user->id : null,
            'type' => $type,
            'previous_status_id' => $previousStatusId,
            'new_status_id' => $newStatusId,
            'description' => $description,
            'visible_to_customer' => $visible,
        ]);
    }
}
