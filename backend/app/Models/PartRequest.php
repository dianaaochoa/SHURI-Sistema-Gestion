<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla: part_requests (original en español: solicitudes_refaccion)
 */
class PartRequest extends Model
{
    protected $table = 'part_requests';

    protected $fillable = [
        'folio',
        'service_order_id',
        'technician_id',
        'product_id',
        'description',
        'quantity',
        'urgency',
        'status',
        'handled_by',
        'handled_at',
        'purchase_order_id',
        'rejection_reason',
        'notes',
    ];

    protected $casts = [
        'handled_at' => 'datetime',
    ];

    public function handledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'handled_by');
    }

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

    public function technician(): BelongsTo
    {
        return $this->belongsTo(User::class, 'technician_id');
    }

    public function orderParts(): HasMany
    {
        return $this->hasMany(OrderPart::class, 'part_request_id');
    }

    public function purchaseOrderItems(): HasMany
    {
        return $this->hasMany(PurchaseOrderItem::class, 'part_request_id');
    }
}
