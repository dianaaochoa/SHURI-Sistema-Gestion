<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla: order_parts (original en español: orden_refacciones)
 */
class OrderPart extends Model
{
    protected $table = 'order_parts';

    protected $fillable = [
        'service_order_id',
        'product_id',
        'technician_id',
        'part_request_id',
        'status',
        'quantity',
        'returned_quantity',
        'unit_price',
        'subtotal',
    ];

    protected $casts = [
        'unit_price' => 'decimal:2',
        'subtotal' => 'decimal:2',
    ];

    public function serviceOrder(): BelongsTo
    {
        return $this->belongsTo(ServiceOrder::class, 'service_order_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function partRequest(): BelongsTo
    {
        return $this->belongsTo(PartRequest::class, 'part_request_id');
    }

    public function technician(): BelongsTo
    {
        return $this->belongsTo(User::class, 'technician_id');
    }

    public function partReturns(): HasMany
    {
        return $this->hasMany(PartReturn::class, 'order_part_id');
    }
}
