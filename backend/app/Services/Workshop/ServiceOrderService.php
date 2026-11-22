<?php

namespace App\Services\Workshop;

use App\Mail\OrderRegisteredMail;
use App\Models\Customer;
use App\Models\Device;
use App\Models\OrderLog;
use App\Models\OrderStatus;
use App\Models\Payment;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Repositories\Contracts\OrderRepositoryInterface;
use App\Services\Cash\CashShiftService;
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
        private readonly CashShiftService $cash,
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

            if (($data['deposit'] ?? 0) > 0) {
                $this->chargeDeposit($order, $by, round((float) $data['deposit'], 2), $data['deposit_method']);
            }

            // Primera visita (o nunca creó su contraseña): acceso al portal para la hoja impresa
            $access = $this->customers->needsPortalAccess($customer)
                ? ['email' => $customer->email] + $this->customers->issueTemporaryPassword($customer, $by)
                : null;

            return [$order, $access];
        });

        // Con la bitácora completa (incluye el anticipo, si hubo)
        $order = $this->orders->findByFolio($order->folio);

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

    /**
     * Anticipo cobrado al recibir el equipo (C5.1): entra al turno de la cajera como una venta
     * de tipo "deposit", así aparece en su corte (C10) y se descuenta del saldo al entregar.
     */
    private function chargeDeposit(ServiceOrder $order, User $by, float $amount, string $method): void
    {
        $shift = $this->cash->current($by);

        if (! $shift) {
            throw ValidationException::withMessages(['deposit' => 'Abre tu turno de caja para cobrar el anticipo.']);
        }

        // El anticipo ya trae el IVA incluido: se separa para el ticket
        $rate = (float) $this->settings->get('tax_rate', 16) / 100;
        $subtotal = round($amount / (1 + $rate), 2);

        $sale = Sale::create([
            'folio' => $this->folios->next('sale'),
            'cash_shift_id' => $shift->id,
            'cash_register_id' => $shift->cash_register_id,
            'cashier_id' => $by->id,
            'customer_id' => $order->customer_id,
            'subtotal' => $subtotal,
            'discount' => 0,
            'tax' => round($amount - $subtotal, 2),
            'status' => 'paid',
            'receipt_type' => 'ticket',
            'paid_at' => now(),
        ]);

        SaleItem::create([
            'sale_id' => $sale->id,
            'type' => 'deposit',
            'service_order_id' => $order->id,
            'description' => "Anticipo de la orden {$order->folio}",
            'quantity' => 1,
            'unit_price' => $amount,
            'discount_pct' => 0,
            'discount_amount' => 0,
            'subtotal' => $amount,
        ]);

        Payment::create([
            'sale_id' => $sale->id,
            'cash_shift_id' => $shift->id,
            'method' => $method,
            'amount' => $amount,
            'amount_received' => $method === 'cash' ? $amount : null,
            'change_given' => $method === 'cash' ? 0 : null,
        ]);

        $order->forceFill(['deposit' => $amount])->save();

        OrderLog::create([
            'service_order_id' => $order->id,
            'user_id' => $by->id,
            'type' => 'intake',
            'description' => 'Anticipo de $'.number_format($amount, 2).' en '.['cash' => 'efectivo', 'card' => 'tarjeta', 'transfer' => 'transferencia'][$method]
                ." (venta {$sale->folio})",
            'visible_to_customer' => true,
        ]);
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
