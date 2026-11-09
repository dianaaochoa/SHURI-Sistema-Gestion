<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla: cash_registers (original en español: cajas)
 */
class CashRegister extends Model
{
    protected $table = 'cash_registers';

    protected $fillable = [
        'name',
        'location',
        'default_opening_amount',
        'shifts',
        'terminal',
        'is_active',
    ];

    protected $casts = [
        'default_opening_amount' => 'decimal:2',
        'is_active' => 'boolean',
    ];

    public function serviceOrders(): HasMany
    {
        return $this->hasMany(ServiceOrder::class, 'cash_register_id');
    }

    public function cashShifts(): HasMany
    {
        return $this->hasMany(CashShift::class, 'cash_register_id');
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class, 'cash_register_id');
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class, 'cash_register_id');
    }
}
