<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla: labor_levels (original en español: niveles_mano_obra)
 */
class LaborLevel extends Model
{
    protected $table = 'labor_levels';

    protected $fillable = [
        'name',
        'typical_time',
        'examples',
        'price',
        'is_inspection',
        'sort_order',
        'is_active',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'is_inspection' => 'boolean',
        'is_active' => 'boolean',
    ];

    public function serviceOrders(): HasMany
    {
        return $this->hasMany(ServiceOrder::class, 'labor_level_id');
    }

    public function quoteItems(): HasMany
    {
        return $this->hasMany(QuoteItem::class, 'labor_level_id');
    }

    public function quotes(): HasMany
    {
        return $this->hasMany(Quote::class, 'labor_level_id');
    }
}
