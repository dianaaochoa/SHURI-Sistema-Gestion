<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla: services (original en español: servicios)
 */
class Service extends Model
{
    protected $table = 'services';

    protected $fillable = [
        'name',
        'description',
        'device_type',
        'price',
        'estimated_minutes',
        'is_active',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'is_active' => 'boolean',
    ];

    public function quoteItems(): HasMany
    {
        return $this->hasMany(QuoteItem::class, 'service_id');
    }

    public function saleItems(): HasMany
    {
        return $this->hasMany(SaleItem::class, 'service_id');
    }
}
