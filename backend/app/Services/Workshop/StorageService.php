<?php

namespace App\Services\Workshop;

use App\Mail\OrderUpdateMail;
use App\Models\OrderLog;
use App\Models\OrderStatus;
use App\Models\SentEmail;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Notifications\DevicesAbandonedNotification;
use App\Services\AuditService;
use App\Services\MailService;
use App\Services\SettingsService;
use App\Support\OrderBalance;
use App\Support\OrderStatusFlow;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;

/**
 * Resguardo y abandono de equipos (RF-09, J9):
 *  - Tras los días de gracia se cobra almacenaje (lo calcula la vista v_storage_devices).
 *  - Se avisa al cliente cuando empieza el cobro y unos días antes del abandono (RF-17).
 *  - A los 90 días el procedimiento sp_process_storage pasa la orden a "En Abandono".
 *  - El jefe manda el equipo a bodega, lo da de baja como desecho o perdona el almacenaje.
 */
class StorageService
{
    public function __construct(
        private readonly MailService $mailer,
        private readonly SettingsService $settings,
        private readonly AuditService $audit,
    ) {}

    /**
     * Almacenaje a cobrar hoy. Mientras espera a ser recogido se calcula al día (vista);
     * en abandono queda el monto que se guardó al pasar a ese estado.
     */
    public function feeFor(ServiceOrder $order): float
    {
        if ($order->storage_fee_waived) {
            return 0.0;
        }

        $live = DB::table('v_storage_devices')->where('service_order_id', $order->id)->value('storage_fee');

        return round((float) ($live ?? $order->storage_fee), 2);
    }

    /**
     * Estados desde los que se puede entregar (en abandono, solo si la configuración lo permite).
     *
     * @return array<int, string>
     */
    public function deliverableStatuses(): array
    {
        $statuses = OrderBalance::DELIVERABLE;

        if ($this->settings->get('allow_delivery_when_abandoned', false)) {
            $statuses[] = OrderStatus::ABANDONED;
        }

        return $statuses;
    }

    /**
     * J9 Equipos en resguardo: los que esperan a su dueño (con su alerta) y los que están en abandono.
     *
     * @return array<int, array<string, mixed>>
     */
    public function devices(?string $alert = null): array
    {
        $waiting = DB::table('v_storage_devices')
            ->when($alert && $alert !== 'abandoned', fn ($q) => $q->where('alert', $alert))
            ->orderByDesc('storage_days')
            ->get()
            ->map(fn ($r) => [
                'folio' => $r->folio,
                'customer' => $r->customer,
                'phone' => $r->phone,
                'status_code' => $r->status_code,
                'status' => $r->status,
                'location' => $r->location,
                'ready_at' => $r->ready_at,
                'storage_days' => (int) $r->storage_days,
                'free_until' => $r->free_until,
                'chargeable_days' => (int) $r->chargeable_days,
                'storage_fee' => (float) $r->storage_fee,
                'storage_fee_waived' => (bool) $r->storage_fee_waived,
                'abandonment_date' => $r->abandonment_date,
                'days_until_abandonment' => (int) $r->days_until_abandonment,
                'alert' => $r->alert,
            ]);

        if ($alert && $alert !== 'abandoned') {
            return $waiting->all();
        }

        $abandoned = ServiceOrder::with(['customer', 'status'])
            ->whereHas('status', fn ($q) => $q->where('code', OrderStatus::ABANDONED))
            ->orderBy('abandoned_at')
            ->get()
            ->map(fn (ServiceOrder $o) => [
                'folio' => $o->folio,
                'customer' => $o->customer->name,
                'phone' => $o->customer->phone,
                'status_code' => $o->status->code,
                'status' => $o->status->name,
                'location' => $o->location,
                'ready_at' => $o->ready_at?->toDateTimeString(),
                'storage_days' => $o->ready_at ? (int) $o->ready_at->diffInDays(now()) : 0,
                'free_until' => null,
                'chargeable_days' => null,
                'storage_fee' => $o->storage_fee_waived ? 0.0 : (float) $o->storage_fee,
                'storage_fee_waived' => (bool) $o->storage_fee_waived,
                'abandonment_date' => $o->abandoned_at?->toDateString(),
                'days_until_abandonment' => 0,
                'alert' => 'abandoned',
            ]);

        return $alert === 'abandoned' ? $abandoned->all() : $waiting->concat($abandoned)->all();
    }

    /**
     * Proceso diario (comando shuri:process-storage o botón del administrador):
     * manda los avisos pendientes y pasa a abandono lo que cumplió el plazo.
     *
     * @return array{storage_fee_notices: int, abandonment_notices: int, abandoned: array<int, string>}
     */
    public function process(?User $by = null): array
    {
        $rows = DB::table('v_storage_devices')->whereIn('alert', ['charging', 'abandonment_notice', 'abandon'])->get();

        $feeNotices = 0;
        $abandonNotices = 0;

        foreach ($rows as $row) {
            if ($row->alert === 'charging' && ! $row->storage_fee_waived && $this->notify($row, 'storage_fee_notice')) {
                $feeNotices++;
            }
            if ($row->alert === 'abandonment_notice' && $this->notify($row, 'abandonment_notice')) {
                $abandonNotices++;
            }
        }

        // El procedimiento almacenado hace el cambio masivo; Laravel controla la transacción
        $folios = DB::transaction(function () use ($rows, $by) {
            DB::select('CALL sp_process_storage(?)', [$by?->id]);

            return ServiceOrder::whereIn('id', $rows->where('alert', 'abandon')->pluck('service_order_id'))
                ->whereHas('status', fn ($q) => $q->where('code', OrderStatus::ABANDONED))
                ->pluck('folio')
                ->all();
        });

        if ($folios) {
            Notification::send($this->storageManagers(), new DevicesAbandonedNotification($folios));
        }

        return ['storage_fee_notices' => $feeNotices, 'abandonment_notices' => $abandonNotices, 'abandoned' => $folios];
    }

    /** J9 Mandar el equipo a la bodega (deja libre el mostrador). */
    public function sendToStorage(ServiceOrder $order, User $by): ServiceOrder
    {
        if (! in_array($order->status->code, [...OrderBalance::DELIVERABLE, OrderStatus::ABANDONED], true)) {
            throw ValidationException::withMessages(['status' => 'Solo se manda a bodega un equipo que espera a ser recogido o que está en abandono.']);
        }
        if ($order->location === 'storage') {
            throw ValidationException::withMessages(['location' => 'El equipo ya está en bodega.']);
        }

        $order->forceFill(['location' => 'storage', 'sent_to_storage_at' => now(), 'updated_by' => $by->id])->save();
        $this->log($order, $by, 'storage', 'Equipo enviado a bodega.');

        return $order;
    }

    /** J9 Desecho electrónico de un equipo en abandono. */
    public function dispose(ServiceOrder $order, User $by, ?string $notes): ServiceOrder
    {
        OrderStatusFlow::assert($order->status->code, OrderStatus::DISPOSED, $order->status->name);

        DB::transaction(function () use ($order, $by, $notes) {
            $order->forceFill([
                'status_id' => OrderStatus::idFor(OrderStatus::DISPOSED),
                'disposed_by' => $by->id,
                'updated_by' => $by->id,
            ])->save(); // el observer registra el cambio de estado

            $this->log($order, $by, 'disposal', 'Equipo enviado a desecho electrónico.'.($notes ? " {$notes}" : ''));
            $this->audit->log('workshop', 'device_disposed', "Orden {$order->folio} enviada a desecho electrónico", $by->id, 'service_orders', $order->id);
        });

        return $order->fresh(['status', 'customer']);
    }

    /** Perdonar el almacenaje (permiso orders.waive_storage), con motivo. */
    public function waive(ServiceOrder $order, User $by, string $reason): ServiceOrder
    {
        if ($order->is_paid) {
            throw ValidationException::withMessages(['status' => 'La orden ya se pagó.']);
        }
        if ($order->storage_fee_waived) {
            throw ValidationException::withMessages(['status' => 'El almacenaje de esta orden ya se perdonó.']);
        }

        $fee = $this->feeFor($order);
        $order->forceFill(['storage_fee_waived' => true, 'updated_by' => $by->id])->save();

        $this->log($order, $by, 'storage', "Almacenaje perdonado (\${$fee}): {$reason}");
        $this->audit->log('workshop', 'storage_fee_waived', "Almacenaje de {$order->folio} perdonado (\${$fee}): {$reason}", $by->id, 'service_orders', $order->id);

        return $order;
    }

    /** Envía un aviso una sola vez por orden y tipo. Devuelve true si se mandó. */
    private function notify(object $row, string $type): bool
    {
        $already = SentEmail::where('service_order_id', $row->service_order_id)->where('type', $type)->where('status', 'sent')->exists();

        if ($already || ! $row->email) {
            return false;
        }

        $order = ServiceOrder::with(['customer', 'device'])->find($row->service_order_id);
        $fee = $this->settings->get('storage_fee_amount', 10);
        $mode = $this->settings->get('storage_fee_mode', 'per_day');

        [$subject, $title, $body, $details] = $type === 'storage_fee_notice'
            ? [
                "Tu equipo sigue esperándote · Folio {$row->folio}",
                'Ya empezó el cobro de almacenaje',
                'Terminaron los días sin costo para recoger tu equipo. Desde hoy se cobra almacenaje según las cláusulas que aceptaste en la recepción.',
                ['Almacenaje' => '$'.number_format((float) $fee, 2).($mode === 'per_day' ? ' por día' : ' (un solo cargo)'), 'Fecha límite' => $this->date($row->abandonment_date)],
            ]
            : [
                "Último aviso: tu equipo pasará a abandono · Folio {$row->folio}",
                'Tu equipo está por pasar a abandono',
                'Si no lo recoges antes de la fecha límite, se considerará abandonado y se enviará a desecho electrónico sin derecho a devolución.',
                ['Fecha límite' => $this->date($row->abandonment_date), 'Almacenaje acumulado' => '$'.number_format((float) $row->storage_fee, 2)],
            ];

        return $this->mailer->send(new OrderUpdateMail(
            subjectLine: $subject,
            customerName: $order->customer->name,
            folio: $order->folio,
            title: $title,
            body: $body,
            details: ['Equipo' => ServiceOrderService::deviceLabel($order->device)] + $details,
            buttonText: 'Ver mi equipo',
            portalUrl: config('app.portal_url'),
        ), $order->customer, $type, $order->id);
    }

    private function date(?string $value): string
    {
        return $value ? date('d/m/Y', strtotime($value)) : '';
    }

    private function log(ServiceOrder $order, User $by, string $type, string $description): void
    {
        OrderLog::create([
            'service_order_id' => $order->id,
            'user_id' => $by->id,
            'type' => $type,
            'description' => $description,
            'visible_to_customer' => false,
        ]);
    }

    /** @return Collection<int, User> */
    private function storageManagers(): Collection
    {
        return User::query()
            ->where('is_active', true)
            ->whereHas('role.permissions', fn ($q) => $q->where('code', 'orders.storage'))
            ->get();
    }
}
