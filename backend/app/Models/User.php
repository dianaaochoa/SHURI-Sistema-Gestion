<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

/**
 * Tabla: users (original en español: users)
 */
class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $table = 'users';

    protected $fillable = [
        'role_id',
        'cash_register_id',
        'name',
        'username',
        'email',
        'email_verified_at',
        'password',
        'phone',
        'specialty',
        'shift',
        'start_time',
        'end_time',
        'max_discount_pct',
        'authorization_code',
        'must_change_password',
        'two_factor_enabled',
        'password_reset_requested_at',
        'chat_available',
        'unavailable_until',
        'unavailable_message',
        'failed_attempts',
        'locked_until',
        'is_active',
        'last_login_at',
        'remember_token',
    ];

    protected $hidden = [
        'password',
        'authorization_code',
        'remember_token',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'password' => 'hashed',
        'max_discount_pct' => 'decimal:2',
        'authorization_code' => 'hashed',
        'must_change_password' => 'boolean',
        'two_factor_enabled' => 'boolean',
        'password_reset_requested_at' => 'datetime',
        'chat_available' => 'boolean',
        'unavailable_until' => 'datetime',
        'locked_until' => 'datetime',
        'is_active' => 'boolean',
        'last_login_at' => 'datetime',
    ];

    public function cashRegister(): BelongsTo
    {
        return $this->belongsTo(CashRegister::class, 'cash_register_id');
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class, 'role_id');
    }

    public function technicianServiceOrders(): HasMany
    {
        return $this->hasMany(ServiceOrder::class, 'technician_id');
    }

    public function userRoleSubstitutions(): HasMany
    {
        return $this->hasMany(RoleSubstitution::class, 'user_id');
    }

    public function userCashShifts(): HasMany
    {
        return $this->hasMany(CashShift::class, 'user_id');
    }

    public function cashierSales(): HasMany
    {
        return $this->hasMany(Sale::class, 'cashier_id');
    }

    /** @var array<int, string>|null Permission codes cached for this request */
    private ?array $permissionCodesCache = null;

    /**
     * Permission codes of the user's role plus any role they are covering
     * today through an active substitution (e.g. technician covering the head).
     *
     * @return array<int, string>
     */
    public function permissionCodes(): array
    {
        if ($this->permissionCodesCache !== null) {
            return $this->permissionCodesCache;
        }

        $roleIds = $this->userRoleSubstitutions()
            ->whereNull('revoked_at')
            ->where('starts_at', '<=', now())
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', now()))
            ->pluck('role_id')
            ->push($this->role_id)
            ->unique();

        return $this->permissionCodesCache = Permission::query()
            ->whereHas('roles', fn ($q) => $q->whereIn('roles.id', $roleIds))
            ->pluck('code')
            ->unique()
            ->values()
            ->all();
    }

    public function hasPermission(string $code): bool
    {
        return in_array($code, $this->permissionCodes(), true);
    }
}
