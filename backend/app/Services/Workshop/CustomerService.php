<?php

namespace App\Services\Workshop;

use App\Models\Customer;
use App\Models\User;
use App\Services\AuditService;
use App\Services\SettingsService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * Customers at the counter (C5 / C8): search, register and give them
 * portal access with a temporary password (RF-06).
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

    /** True when the customer still has no password of their own. */
    public function needsPortalAccess(Customer $customer): bool
    {
        return $customer->password === null || $customer->must_change_password;
    }

    /**
     * New temporary password for the portal. Stored hashed for login and
     * encrypted (never plain) so the reception sheet can be reprinted (C11).
     *
     * @return array{temporary_password: string, expires_at: Carbon}
     */
    public function issueTemporaryPassword(Customer $customer, User $by): array
    {
        $plain = Str::password(8, letters: true, numbers: true, symbols: false);
        $expiresAt = now()->addHours($this->settings->int('portal_temp_password_hours', 72));

        $customer->forceFill([
            'password' => $plain, // hashed by the model cast
            'must_change_password' => true,
            'temporary_password_encrypted' => $plain, // encrypted by the model cast
            'temporary_password_expires_at' => $expiresAt,
            'failed_attempts' => 0,
            'locked_until' => null,
        ])->save();

        $customer->tokens()->delete();

        $this->audit->log('customers', 'temporary_password', "Contraseña temporal del portal para {$customer->email}", $by->id, 'customers', $customer->id);

        return ['temporary_password' => $plain, 'expires_at' => $expiresAt];
    }
}
