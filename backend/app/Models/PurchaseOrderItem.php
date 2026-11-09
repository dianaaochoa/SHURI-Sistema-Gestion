<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabla: purchase_order_items (original en español: pedido_detalles)
 */
class PurchaseOrderItem extends Model
{
    protected $table = 'purchase_order_items';
    public $timestamps = false;

    protected $fillable = [
        'purchase_order_id',
        'product_id',
        'service_order_id',
        'part_request_id',
        'description',
        'quantity',
        'received_quantity',
        'unit_cost',
    ];

    protected $casts = [
        'unit_cost' => 'decimal:2',
        'subtotal' => 'decimal:2',
    ];

    public function serviceOrder(): BelongsTo
    {
        return $this->belongsTo(ServiceOrder::class, 'service_order_id');
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class, 'purchase_order_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function partRequest(): BelongsTo
    {
        return $this->belongsTo(PartRequest::class, 'part_request_id');
    }
}
