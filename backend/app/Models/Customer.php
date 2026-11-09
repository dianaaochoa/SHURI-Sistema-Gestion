<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

/**
 * Tabla: customers (original en español: clientes)
 */
class Customer extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $table = 'customers';

    protected $fillable = [
        'name',
        'last_name',
        'phone',
        'email',
        'address',
        'neighborhood',
        'city',
        'state',
        'postal_code',
        'notes',
        'password',
        'must_change_password',
        'temporary_password_expires_at',
        'temporary_password_encrypted',
        'password_changed_at',
        'email_verified_at',
        'failed_attempts',
        'locked_until',
        'last_login_at',
        'privacy_accepted_at',
        'is_active',
        'remember_token',
    ];

    protected $hidden = [
        'password',
        'temporary_password_encrypted',
        'remember_token',
    ];

    protected $casts = [
        'password' => 'hashed',
        'must_change_password' => 'boolean',
        'temporary_password_expires_at' => 'datetime',
        'temporary_password_encrypted' => 'encrypted',
        'password_changed_at' => 'datetime',
        'email_verified_at' => 'datetime',
        'locked_until' => 'datetime',
        'last_login_at' => 'datetime',
        'privacy_accepted_at' => 'datetime',
        'is_active' => 'boolean',
    ];

    public function customerTaxProfiles(): HasMany
    {
        return $this->hasMany(CustomerTaxProfile::class, 'customer_id');
    }

    public function customerPasswordResetTokens(): HasMany
    {
        return $this->hasMany(CustomerPasswordResetToken::class, 'customer_id');
    }

    public function conversations(): HasMany
    {
        return $this->hasMany(Conversation::class, 'customer_id');
    }

    public function sentEmails(): HasMany
    {
        return $this->hasMany(SentEmail::class, 'customer_id');
    }

    public function devices(): HasMany
    {
        return $this->hasMany(Device::class, 'customer_id');
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class, 'customer_id');
    }

    public function warranties(): HasMany
    {
        return $this->hasMany(Warranty::class, 'customer_id');
    }

    public function creditNotes(): HasMany
    {
        return $this->hasMany(CreditNote::class, 'customer_id');
    }

    public function serviceOrders(): HasMany
    {
        return $this->hasMany(ServiceOrder::class, 'customer_id');
    }

    public function quotes(): HasMany
    {
        return $this->hasMany(Quote::class, 'customer_id');
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class, 'customer_id');
    }
}
