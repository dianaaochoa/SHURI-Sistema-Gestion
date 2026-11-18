<?php

namespace App\Services\Workshop;

use App\Mail\OrderRegisteredMail;
use App\Models\Customer;
use App\Models\Device;
use App\Models\OrderStatus;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Repositories\Contracts\OrderRepositoryInterface;
use App\Services\FolioService;
use App\Services\MailService;
use App\Services\SettingsService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Reglas de negocio del taller para las órdenes de servicio.
 * Recepción (C5, RF-03): cliente + equipo + orden con folio único,
 * todo en una sola transacción (RNF-04).
 */
class ServiceOrderService
{
    public function __construct(
        private readonly OrderRepositoryInterface $orders,
        private readonly CustomerService $customers,
        private readonly FolioService $folios,
        private readonly SettingsService $settings,
        private readonly MailService $mailer,
    ) {}

    /**
     * @param  array<string, mixed>  $data  validated StoreServiceOrderRequest
     * @return array{order: ServiceOrder, portal_access: array{email: string, temporary_password: string, expires_at: Carbon}|null, email_sent: bool}
     */
    public function receive(array $data, User $by): array
    {
        [$order, $access] = DB::transaction(function () use ($data, $by) {
            $customer = $this->resolveCustomer($data, $by);
            $device = $this->resolveDevice($data['device'], $customer);

            $order = $this->orders->create([
                'folio' => $this->folios->next('service_order'),
                'customer_id' => $customer->id,
                'device_id' => $device->id,
                'status_id' => OrderStatus::idFor(OrderStatus::RECEIVED),
                'priority' => $data['priority'] ?? 'normal',
                'cash_register_id' => $by->cash_register_id,
                'reported_issue' => $data['reported_issue'],
                'received_accessories' => $data['received_accessories'] ?? null,
                'physical_condition' => $data['physical_condition'] ?? null,
                'intake_checklist' => $data['intake_checklist'] ?? null,
                'device_pin' => $data['device_pin'] ?? null, // el cast del modelo lo cifra
                'promised_date' => $data['promised_date'] ?? null,
                'diagnosis_due_at' => now()->addHours($this->settings->int('diagnosis_sla_hours', 24)),
                'warranty_days' => $this->settings->int('default_warranty_days', 30),
                'received_by' => $by->id,
            ]);

            // Primera visita (o nunca creó su contraseña): acceso al portal para la hoja impresa
            $access = $this->customers->needsPortalAccess($customer)
                ? ['email' => $customer->email] + $this->customers->issueTemporaryPassword($customer, $by)
                : null;

            return [$order, $access];
        });

        $emailSent = $this->mailer->send(
            new OrderRegisteredMail(
                customerName: $order->customer->name,
                folio: $order->folio,
                device: self::deviceLabel($order->device),
                email: $order->customer->email,
                temporaryPassword: $access['temporary_password'] ?? null,
                portalUrl: config('app.portal_url'),
            ),
            $order->customer,
            'order_registered',
        );

        return ['order' => $order, 'portal_access' => $access, 'email_sent' => $emailSent];
    }

    public static function deviceLabel(Device $device): string
    {
        return trim("{$device->type} {$device->brand} {$device->model}");
    }

    /** @param  array<string, mixed>  $data */
    private function resolveCustomer(array $data, User $by): Customer
    {
        if (! empty($data['customer_id'])) {
            $customer = Customer::where('is_active', true)->find($data['customer_id']);

            if (! $customer) {
                throw ValidationException::withMessages(['customer_id' => 'El cliente no existe o está dado de baja.']);
            }

            return $customer;
        }

        return $this->customers->create($data['customer'], $by);
    }

    /** @param  array<string, mixed>  $data */
    private function resolveDevice(array $data, Customer $customer): Device
    {
        if (! empty($data['id'])) {
            $device = $customer->devices()->find($data['id']);

            if (! $device) {
                throw ValidationException::withMessages(['device.id' => 'El equipo no pertenece a este cliente.']);
            }

            return $device;
        }

        return $customer->devices()->create([
            'type' => $data['type'],
            'brand' => $data['brand'],
            'model' => $data['model'] ?? null,
            'serial_number' => $data['serial_number'] ?? null,
            'color' => $data['color'] ?? null,
        ]);
    }
}
