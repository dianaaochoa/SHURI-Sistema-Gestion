<?php

namespace App\Services\Workshop;

use App\Models\Customer;
use App\Models\Sale;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Services\AuditService;
use App\Services\SettingsService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * Clientes en mostrador (C5 / C8): buscar, registrar y darles
 * acceso al portal con una contraseña temporal (RF-06).
 */
class CustomerService
{
    public function __construct(
        private readonly SettingsService $settings,
        private readonly AuditService $audit,
    ) {}

    /** @return Collection<int, Customer> */
    public function search(string $term, int $limit = 20): Collection
    {
        $like = '%'.addcslashes(trim($term), '%_\\').'%';

        return Customer::query()
            ->where('is_active', true)
            ->where(fn ($q) => $q
                ->where('name', 'like', $like)
                ->orWhere('last_name', 'like', $like)
                ->orWhere('phone', 'like', $like)
                ->orWhere('email', 'like', $like))
            ->withCount('serviceOrders')
            ->orderBy('name')
            ->limit($limit)
            ->get();
    }

    /** @param  array<string, mixed>  $data */
    public function create(array $data, User $by): Customer
    {
        $customer = Customer::create([
            'name' => $data['name'],
            'last_name' => $data['last_name'] ?? null,
            'phone' => $data['phone'],
            'email' => $data['email'],
            'address' => $data['address'] ?? null,
            'city' => $data['city'] ?? null,
            'postal_code' => $data['postal_code'] ?? null,
            'notes' => $data['notes'] ?? null,
            'must_change_password' => true,
        ]);

        $this->audit->log('customers', 'created', "Alta de cliente {$customer->name} {$customer->last_name}", $by->id, 'customers', $customer->id);

        return $customer;
    }

    /**
     * C8 Lista de clientes con su resumen: equipos activos (códigos de estado), última visita,
     * total gastado y número de visitas. Sin búsqueda trae a todos (hasta $limit).
     *
     * @return Collection<int, Customer>
     */
    public function listing(?string $term, int $limit = 300): Collection
    {
        $customers = $term ? $this->search($term, $limit) : Customer::where('is_active', true)->withCount('serviceOrders')->orderBy('name')->limit($limit)->get();
        $ids = $customers->pluck('id');

        $orders = ServiceOrder::query()->join('order_statuses', 'order_statuses.id', '=', 'service_orders.status_id')
            ->whereIn('customer_id', $ids)
            ->get(['service_orders.customer_id', 'service_orders.created_at', 'order_statuses.code', 'order_statuses.is_final'])
            ->groupBy('customer_id');
        $sales = Sale::whereIn('customer_id', $ids)->whereIn('status', ['paid', 'partially_returned'])
            ->get(['customer_id', 'total', 'paid_at'])
            ->groupBy('customer_id');

        foreach ($customers as $customer) {
            $o = $orders->get($customer->id, collect());
            $s = $sales->get($customer->id, collect());
            $visits = $o->pluck('created_at')->merge($s->pluck('paid_at'))->filter();

            $customer->setAttribute('summary', [
                // Equipos que siguen en la sucursal (no entregados, cancelados ni desechados)
                'active_orders' => $o->where('is_final', false)->pluck('code')->values()->all(),
                'last_visit' => $visits->max()?->toIso8601String(),
                'total_spent' => round((float) $s->sum('total'), 2),
                'visits' => $visits->map(fn ($d) => $d->toDateString())->unique()->count(),
            ]);
        }

        return $customers;
    }

    /**
     * C8.3 Historial del cliente: sus equipos (con garantías) y sus compras, del más reciente al más antiguo.
     *
     * @return array{orders: array<int, array<string, mixed>>, sales: array<int, array<string, mixed>>}
     */
    public function history(Customer $customer): array
    {
        $orders = $customer->serviceOrders()->with(['status', 'device', 'warranties'])->latest('id')->get()
            ->map(fn (ServiceOrder $o) => [
                'folio' => $o->folio,
                'created_at' => $o->created_at?->toIso8601String(),
                'device' => ServiceOrderService::deviceLabel($o->device),
                'reported_issue' => $o->reported_issue,
                'diagnosis' => $o->diagnosis,
                'total' => round((float) $o->labor_cost + (float) $o->parts_cost, 2),
                'deposit' => (float) $o->deposit,
                'is_paid' => (bool) $o->is_paid,
                'status' => ['code' => $o->status->code, 'name' => $o->status->name],
                'warranties' => $o->warranties->map(fn ($w) => [
                    'folio' => $w->folio,
                    'created_at' => $w->created_at?->toIso8601String(),
                    'reason' => $w->customer_reason,
                    'status' => $w->status,
                    'extra_cost' => $w->extra_cost !== null ? (float) $w->extra_cost : null,
                ])->all(),
            ])->all();

        $sales = $customer->sales()->with('saleItems')->latest('id')->get()
            ->map(fn (Sale $s) => [
                'folio' => $s->folio,
                'paid_at' => ($s->paid_at ?? $s->created_at)?->toIso8601String(),
                'items' => $s->saleItems->map(fn ($i) => ['type' => $i->type, 'description' => $i->description, 'quantity' => $i->quantity])->all(),
                'total' => (float) $s->total,
                'status' => $s->status,
            ])->all();

        return ['orders' => $orders, 'sales' => $sales];
    }

    /** @param  array<string, mixed>  $data */
    public function update(Customer $customer, array $data, User $by): Customer
    {
        $before = $customer->only(array_keys($data));
        $customer->fill($data)->save();

        $changes = array_intersect_key($customer->getChanges(), $data);
        if ($changes) {
            $this->audit->log('customers', 'updated', "Edición del cliente {$customer->name} {$customer->last_name}", $by->id, 'customers', $customer->id,
                array_intersect_key($before, $changes), $changes);
        }

        return $customer;
    }

    /** True si el cliente todavía no tiene contraseña propia. */
    public function needsPortalAccess(Customer $customer): bool
    {
        return $customer->password === null || $customer->must_change_password;
    }

    /**
     * Nueva contraseña temporal del portal. Se guarda con hash para el acceso y
     * cifrada (nunca en texto plano) para poder reimprimir la hoja de recepción (C11).
     *
     * @return array{temporary_password: string, expires_at: Carbon}
     */
    public function issueTemporaryPassword(Customer $customer, User $by): array
    {
        $plain = Str::password(8, letters: true, numbers: true, symbols: false);
        $expiresAt = now()->addHours($this->settings->int('portal_temp_password_hours', 72));

        $customer->forceFill([
            'password' => $plain, // el cast del modelo aplica el hash
            'must_change_password' => true,
            'temporary_password_encrypted' => $plain, // el cast del modelo la cifra
            'temporary_password_expires_at' => $expiresAt,
            'failed_attempts' => 0,
            'locked_until' => null,
        ])->save();

        $customer->tokens()->delete();

        $this->audit->log('customers', 'temporary_password', "Contraseña temporal del portal para {$customer->email}", $by->id, 'customers', $customer->id);

        return ['temporary_password' => $plain, 'expires_at' => $expiresAt];
    }
}
