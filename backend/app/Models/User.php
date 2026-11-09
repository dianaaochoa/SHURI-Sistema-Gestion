<?php

namespace App\Models;

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
    use HasApiTokens, Notifiable;

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
}
