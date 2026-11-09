<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla: devices (original en español: equipos)
 */
class Device extends Model
{
    protected $table = 'devices';

    protected $fillable = [
        'customer_id',
        'type',
        'brand',
        'model',
        'serial_number',
        'color',
    ];

    protected $casts = [];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    public function serviceOrders(): HasMany
    {
        return $this->hasMany(ServiceOrder::class, 'device_id');
    }
}
