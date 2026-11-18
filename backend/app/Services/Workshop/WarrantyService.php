<?php

namespace App\Services\Workshop;

use App\Mail\OrderUpdateMail;
use App\Models\Customer;
use App\Models\OrderLog;
use App\Models\OrderStatus;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Models\Warranty;
use App\Notifications\WarrantyRequestedNotification;
use App\Services\FolioService;
use App\Services\MailService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;

/**
 * Garantías (RF-11, README §14.4): sobre una orden entregada con garantía vigente.
 * Flujo: requested → received → in_review → awaiting_ruling →
 *        in_repair (procede) | approved (procede con costo, espera al cliente) | rejected (no procede)
 *        → finished → delivered.
 */
class WarrantyService
{
    /** Estados en los que la garantía sigue abierta (solo una por orden). */
    public const ACTIVE = ['requested', 'received', 'in_review', 'awaiting_ruling', 'approved', 'in_repair', 'finished'];

    /** Estados en los que el equipo ya puede devolverse al cliente. */
    public const DELIVERABLE = ['finished', 'rejected'];

    public function __construct(
        private readonly FolioService $folios,
        private readonly MailService $mailer,
    ) {}

    /**
     * El cliente la pide desde el portal (P3) o la cajera la registra en mostrador (C4).
     * En mostrador el equipo ya está en la sucursal, así que queda "recibida".
     */
    public function request(ServiceOrder $order, string $reason, ?Customer $customer = null, ?User $cashier = null): Warranty
    {
        return DB::transaction(function () use ($order, $reason, $cashier) {
            $order = ServiceOrder::with('status')->lockForUpdate()->findOrFail($order->id);

            if ($order->status->code !== OrderStatus::DELIVERED || ! $order->warranty_until || $order->warranty_until->lt(today())) {
                throw ValidationException::withMessages([
                    'service_order' => 'La garantía de esta orden no está vigente.',
                ]);
            }

            if (Warranty::where('service_order_id', $order->id)->whereIn('status', self::ACTIVE)->exists()) {
                throw ValidationException::withMessages([
                    'service_order' => 'Esta orden ya tiene una garantía en proceso.',
                ]);
            }

            $atCounter = $cashier !== null;

            $warranty = Warranty::create([
                'folio' => $this->folios->next('warranty'),
                'service_order_id' => $order->id,
                'customer_id' => $order->customer_id,
                'request_channel' => $atCounter ? 'counter' : 'portal',
                'customer_reason' => $reason,
                'status' => $atCounter ? 'received' : 'requested',
                'received_by' => $cashier?->id,
                'received_at' => $atCounter ? now() : null,
                // Por defecto la revisa quien hizo la reparación
                'technician_id' => $order->technician_id,
            ]);

            $this->log($warranty, $cashier, $atCounter
                ? "Garantía {$warranty->folio} registrada en mostrador; equipo recibido."
                : "Solicitaste la garantía {$warranty->folio}. Trae tu equipo a la sucursal para revisarlo.", true);

            Notification::send($this->rulers(), new WarrantyRequestedNotification($warranty->load('serviceOrder')));

            return $warranty;
        });
    }

    /** La cajera recibe el equipo de una garantía pedida desde el portal. */
    public function receive(Warranty $warranty, User $cashier): Warranty
    {
        $this->expect($warranty, ['requested'], 'Esta garantía ya fue recibida.');

        $warranty->forceFill(['status' => 'received', 'received_by' => $cashier->id, 'received_at' => now()])->save();
        $this->log($warranty, $cashier, "Recibimos tu equipo para revisar la garantía {$warranty->folio}.", true);

        return $warranty;
    }

    /** El jefe manda el equipo a revisión con un técnico. */
    public function assign(Warranty $warranty, User $head, int $technicianId): Warranty
    {
        $this->expect($warranty, ['received', 'in_review'], 'Primero hay que recibir el equipo en la sucursal.');

        $technician = User::where('is_active', true)->find($technicianId);
        if (! $technician || ! $technician->hasPermission('orders.repair')) {
            throw ValidationException::withMessages(['technician_id' => 'Solo puedes asignar la garantía a un técnico activo.']);
        }

        $warranty->forceFill(['status' => 'in_review', 'technician_id' => $technician->id])->save();
        $this->log($warranty, $head, "Garantía {$warranty->folio} asignada a {$technician->name} para revisión.", false);

        return $warranty;
    }

    /** T4: el técnico revisa el equipo y deja su reporte para que el jefe dictamine. */
    public function review(Warranty $warranty, User $technician, string $report): Warranty
    {
        $this->expectTechnician($warranty, $technician);
        $this->expect($warranty, ['in_review'], 'Esta garantía no está en revisión.');

        $warranty->forceFill(['status' => 'awaiting_ruling', 'technician_review' => $report])->save();
        $this->log($warranty, $technician, "Revisión técnica de la garantía {$warranty->folio}: {$report}", false);

        return $warranty;
    }

    /**
     * J4: el jefe dictamina. "Procede" pasa a reparación; "procede con costo"
     * espera a que el cliente acepte el cargo; "no procede" deja el equipo para devolverse.
     */
    public function rule(Warranty $warranty, User $head, string $ruling, string $reason, float $extraCost = 0): Warranty
    {
        $this->expect($warranty, ['awaiting_ruling'], 'Esta garantía todavía no tiene la revisión del técnico.');

        if ($ruling === 'covered_with_cost' && $extraCost <= 0) {
            throw ValidationException::withMessages(['extra_cost' => 'Indica el costo extra que pagará el cliente.']);
        }

        $status = match ($ruling) {
            'covered' => 'in_repair',
            'covered_with_cost' => 'approved',
            default => 'rejected',
        };

        $warranty->forceFill([
            'status' => $status,
            'ruling' => $ruling,
            'ruling_reason' => $reason,
            'ruled_by' => $head->id,
            'ruled_at' => now(),
            'extra_cost' => $ruling === 'covered_with_cost' ? round($extraCost, 2) : 0,
        ])->save();

        $text = match ($ruling) {
            'covered' => 'La garantía procede: repararemos tu equipo sin costo.',
            'covered_with_cost' => 'La garantía procede con un costo extra de $'.number_format($extraCost, 2).'. Acéptalo en el portal para iniciar la reparación.',
            default => "La garantía no procede: {$reason} Puedes pasar por tu equipo a la sucursal.",
        };

        $this->log($warranty, $head, "Dictamen de la garantía {$warranty->folio}. {$text}", true);
        $this->notifyCustomer($warranty, 'Dictamen de tu garantía', $text, 'warranty_ruling');

        return $warranty;
    }

    /** P3: el cliente acepta o rechaza el costo extra de una garantía "procede con costo". */
    public function answer(Warranty $warranty, Customer $customer, bool $accepted): Warranty
    {
        $this->expect($warranty, ['approved'], 'Esta garantía no espera tu respuesta.');

        $warranty->forceFill([
            'extra_cost_accepted' => $accepted,
            'answered_at' => now(),
            'status' => $accepted ? 'in_repair' : 'rejected',
        ])->save();

        $this->log($warranty, null, $accepted
            ? "Aceptaste el costo extra de la garantía {$warranty->folio}; comenzamos la reparación."
            : "No aceptaste el costo extra de la garantía {$warranty->folio}; puedes pasar por tu equipo.", true);

        return $warranty;
    }

    /** El técnico termina la reparación de la garantía: el equipo queda listo para recoger. */
    public function finish(Warranty $warranty, User $technician): Warranty
    {
        $this->expectTechnician($warranty, $technician);
        $this->expect($warranty, ['in_repair'], 'Esta garantía no está en reparación.');

        $warranty->forceFill(['status' => 'finished', 'finished_at' => now()])->save();

        $text = $warranty->extra_cost > 0
            ? 'Terminamos la reparación de tu garantía. Al recoger tu equipo pagarás $'.number_format((float) $warranty->extra_cost, 2).'.'
            : 'Terminamos la reparación de tu garantía. Ya puedes pasar por tu equipo a la sucursal.';

        $this->log($warranty, $technician, $text, true);
        $this->notifyCustomer($warranty, 'Tu equipo está listo', $text, 'warranty');

        return $warranty;
    }

    /**
     * Entrega en mostrador sin cobro. Si hay costo extra se entrega desde el
     * punto de venta (renglón "warranty"), que llama a markDelivered().
     */
    public function deliver(Warranty $warranty, User $cashier): Warranty
    {
        $this->expect($warranty, self::DELIVERABLE, 'El equipo de esta garantía todavía no está listo para entregarse.');

        if ($warranty->status === 'finished' && (float) $warranty->extra_cost > 0) {
            throw ValidationException::withMessages([
                'status' => 'Esta garantía tiene costo extra: cóbrala en el punto de venta.',
            ]);
        }

        return $this->markDelivered($warranty, $cashier);
    }

    public function markDelivered(Warranty $warranty, User $cashier): Warranty
    {
        $warranty->forceFill(['status' => 'delivered', 'delivered_by' => $cashier->id, 'delivered_at' => now()])->save();
        $this->log($warranty, $cashier, "Entregamos tu equipo de la garantía {$warranty->folio}.", true);

        return $warranty;
    }

    /** @param  array<int, string>  $statuses */
    private function expect(Warranty $warranty, array $statuses, string $message): void
    {
        if (! in_array($warranty->status, $statuses, true)) {
            throw ValidationException::withMessages(['status' => $message]);
        }
    }

    private function expectTechnician(Warranty $warranty, User $technician): void
    {
        if ($warranty->technician_id !== $technician->id) {
            throw ValidationException::withMessages(['status' => 'Esta garantía está asignada a otro técnico.']);
        }
    }

    /** Quienes dictaminan garantías (permiso warranties.rule). */
    private function rulers()
    {
        return User::where('is_active', true)
            ->whereHas('role.permissions', fn ($q) => $q->where('code', 'warranties.rule'))
            ->get();
    }

    private function log(Warranty $warranty, ?User $user, string $description, bool $visible): void
    {
        OrderLog::create([
            'service_order_id' => $warranty->service_order_id,
            'user_id' => $user?->id,
            'type' => 'warranty',
            'warranty_id' => $warranty->id,
            'description' => $description,
            'visible_to_customer' => $visible,
        ]);
    }

    private function notifyCustomer(Warranty $warranty, string $title, string $text, string $type): void
    {
        $warranty->loadMissing('serviceOrder.customer');
        $order = $warranty->serviceOrder;

        $this->mailer->send(new OrderUpdateMail(
            subjectLine: "{$title} · Garantía {$warranty->folio}",
            customerName: $order->customer->name,
            folio: $order->folio,
            title: $title,
            body: $text,
            details: ['Garantía' => $warranty->folio],
            buttonText: 'Ver mi garantía',
            portalUrl: config('app.portal_url'),
        ), $order->customer, $type);
    }
}
