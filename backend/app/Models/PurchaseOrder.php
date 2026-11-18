<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla: purchase_orders (original en español: pedidos_proveedor)
 */
class PurchaseOrder extends Model
{
    protected $table = 'purchase_orders';

    protected $fillable = [
        'folio',
        'supplier_id',
        'requested_by',
        'status',
        'expected_date',
        'payment_terms',
        'receive_at',
        'notify_technician',
        'supplier_folio',
        'estimated_total',
        'notes',
    ];

    protected $casts = [
        'expected_date' => 'date',
        'notify_technician' => 'boolean',
        'estimated_total' => 'decimal:2',
    ];

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function purchases(): HasMany
    {
        return $this->hasMany(Purchase::class, 'purchase_order_id');
    }

    public function purchaseOrderItems(): HasMany
    {
        return $this->hasMany(PurchaseOrderItem::class, 'purchase_order_id');
    }

    public function partRequests(): HasMany
    {
        return $this->hasMany(PartRequest::class, 'purchase_order_id');
    }
}
