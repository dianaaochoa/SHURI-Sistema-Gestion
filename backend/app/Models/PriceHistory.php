<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabla: price_histories (original en español: historial_precios)
 */
class PriceHistory extends Model
{
    protected $table = 'price_histories';
    const UPDATED_AT = null;

    protected $fillable = [
        'product_id',
        'user_id',
        'old_purchase_price',
        'new_purchase_price',
        'old_sale_price',
        'new_sale_price',
        'reason',
        'batch_uuid',
    ];

    protected $casts = [
        'old_purchase_price' => 'decimal:2',
        'new_purchase_price' => 'decimal:2',
        'old_sale_price' => 'decimal:2',
        'new_sale_price' => 'decimal:2',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
