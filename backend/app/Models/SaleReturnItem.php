<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabla: sale_return_items (original en español: devolucion_detalles)
 */
class SaleReturnItem extends Model
{
    protected $table = 'sale_return_items';
    public $timestamps = false;

    protected $fillable = [
        'sale_return_id',
        'sale_item_id',
        'quantity',
        'amount',
        'returns_to_inventory',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'returns_to_inventory' => 'boolean',
    ];

    public function saleReturn(): BelongsTo
    {
        return $this->belongsTo(SaleReturn::class, 'sale_return_id');
    }

    public function saleItem(): BelongsTo
    {
        return $this->belongsTo(SaleItem::class, 'sale_item_id');
    }
}
