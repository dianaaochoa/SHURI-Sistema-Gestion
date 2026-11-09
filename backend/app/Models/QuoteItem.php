<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabla: quote_items (original en español: presupuesto_detalles)
 */
class QuoteItem extends Model
{
    protected $table = 'quote_items';
    public $timestamps = false;

    protected $fillable = [
        'quote_id',
        'type',
        'product_id',
        'service_id',
        'labor_level_id',
        'concept',
        'quantity',
        'unit_cost',
        'unit_price',
        'out_of_stock',
        'expected_arrival_date',
        'origin',
    ];

    protected $casts = [
        'unit_cost' => 'decimal:2',
        'unit_price' => 'decimal:2',
        'subtotal' => 'decimal:2',
        'out_of_stock' => 'boolean',
        'expected_arrival_date' => 'date',
    ];

    public function laborLevel(): BelongsTo
    {
        return $this->belongsTo(LaborLevel::class, 'labor_level_id');
    }

    public function quote(): BelongsTo
    {
        return $this->belongsTo(Quote::class, 'quote_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class, 'service_id');
    }
}
