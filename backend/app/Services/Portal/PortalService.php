<?php

namespace App\Services\Portal;

use App\Models\Customer;
use App\Models\ServiceOrder;
use App\Services\SettingsService;
use App\Support\OrderBalance;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Portal del cliente (RF-06): sus equipos (P1), seguimiento con línea de tiempo (P2)
 * e información de la sucursal (P4). Lee las vistas v_portal_orders y v_portal_timeline,
 * que solo exponen lo que el cliente puede ver (nada de PIN, costos ni notas internas).
 */
class PortalService
{
    /** Pasos de la barra de avance de P2 (order_statuses.portal_step). */
    public const STEPS = [
        1 => 'Recibido',
        2 => 'En diagnóstico',
        3 => 'Presupuesto',
        4 => 'En reparación',
        5 => 'Listo para recoger',
        6 => 'Entregado',
    ];

    public function __construct(private readonly SettingsService $settings) {}

    /** @return Collection<int, array<string, mixed>> */
    public function myOrders(Customer $customer, bool $onlyActive = false): Collection
    {
        return DB::table('v_portal_orders')
            ->where('customer_id', $customer->id)
            ->when($onlyActive, fn ($q) => $q->where('is_final', false))
            ->orderByDesc('received_at')
            ->get()
            ->map(fn ($row) => $this->summary($row));
    }

    /**
     * Detalle de un folio del cliente; null si no existe o es de otra persona.
     *
     * @return array<string, mixed>|null
     */
    public function findMine(Customer $customer, string $folio): ?array
    {
        $row = DB::table('v_portal_orders')
            ->where('customer_id', $customer->id)
            ->where('folio', $folio)
            ->first();

        if (! $row) {
            return null;
        }

        return $this->summary($row) + [
            'reported_issue' => $row->reported_issue,
            'diagnosis' => $row->diagnosis,
            'steps' => $this->steps((int) $row->portal_step),
            'timeline' => DB::table('v_portal_timeline')
                ->where('service_order_id', $row->service_order_id)
                ->orderBy('created_at')
                ->get()
                ->map(fn ($e) => [
                    'date' => $this->iso($e->created_at),
                    'description' => $e->description,
                    'status' => $e->status,
                    'color' => $e->color_hex,
                ])
                ->values(),
        ];
    }

    /** @return array<string, mixed> */
    public function info(): array
    {
        return [
            'business_name' => $this->settings->get('business_name'),
            'address' => $this->settings->get('address'),
            'phone' => $this->settings->get('business_phone'),
            'email' => $this->settings->get('business_email'),
            'hours' => $this->settings->get('business_hours'),
            'pickup_grace_days' => $this->settings->int('pickup_grace_days', 7),
            'abandonment_days' => $this->settings->int('abandonment_days', 90),
            'service_terms' => $this->settings->get('service_terms'),
            'privacy_notice' => $this->settings->get('privacy_notice'),
        ];
    }

    /** @return array<string, mixed> */
    private function summary(object $row): array
    {
        return [
            'folio' => $row->folio,
            'device' => trim("{$row->device_type} {$row->device_brand} {$row->device_model}"),
            'status' => [
                'code' => $row->status_code,
                'name' => $row->status,
                'message' => $row->customer_message,
                'color' => $row->color_hex,
                'step' => (int) $row->portal_step,
                'is_final' => (bool) $row->is_final,
            ],
            // Solo el nombre de pila del técnico (privacidad del personal)
            'technician' => $row->technician ? strtok($row->technician, ' ') : null,
            'received_at' => $this->iso($row->received_at),
            'promised_date' => $row->promised_date,
            'ready_at' => $this->iso($row->ready_at),
            'delivered_at' => $this->iso($row->delivered_at),
            'is_paid' => (bool) $row->is_paid,
            'amount_due' => $this->amountDue($row),
            'free_pickup_until' => $row->free_until,
            'abandonment_date' => $row->abandonment_date,
            'warranty_until' => $row->warranty_until,
            'warranty_active' => (bool) $row->warranty_active,
            'has_pending_quote' => $row->pending_quote_id !== null,
        ];
    }

    /**
     * Mismo cálculo que ve la cajera al entregar (OrderBalance), para que el
     * cliente sepa exactamente cuánto pagará; 0 si aún no está para recoger.
     */
    private function amountDue(object $row): float
    {
        if ($row->is_paid || ! in_array($row->status_code, OrderBalance::DELIVERABLE, true)) {
            return 0.0;
        }

        $order = ServiceOrder::with('status')->find($row->service_order_id);

        return OrderBalance::for($order)['amount_due'];
    }

    /** @return array<int, array{step: int, name: string, done: bool, current: bool}> */
    private function steps(int $current): array
    {
        return collect(self::STEPS)->map(fn (string $name, int $step) => [
            'step' => $step,
            'name' => $name,
            'done' => $current > 0 && $step < $current,
            'current' => $step === $current,
        ])->values()->all();
    }

    private function iso(?string $date): ?string
    {
        return $date ? Carbon::parse($date)->toIso8601String() : null;
    }
}
