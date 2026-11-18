<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabla: inventory_movements (original en español: movimientos_inventario)
 */
class InventoryMovement extends Model
{
    protected $table = 'inventory_movements';
    const UPDATED_AT = null;

    protected $fillable = [
        'product_id',
        'user_id',
        'authorized_by',
        'type',
        'quantity',
        'previous_stock',
        'new_stock',
        'sale_id',
        'service_order_id',
        'purchase_id',
        'sale_return_id',
        'reference_id',
        'reason',
    ];

    protected $casts = [];

    public function authorizedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'authorized_by');
    }

    public function purchase(): BelongsTo
    {
        return $this->belongsTo(Purchase::class, 'purchase_id');
    }

    public function saleReturn(): BelongsTo
    {
        return $this->belongsTo(SaleReturn::class, 'sale_return_id');
    }

    public function serviceOrder(): BelongsTo
    {
        return $this->belongsTo(ServiceOrder::class, 'service_order_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class, 'sale_id');
    }
}
