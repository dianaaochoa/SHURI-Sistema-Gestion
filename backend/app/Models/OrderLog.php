<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabla: order_logs (original en español: bitacora_orden)
 */
class OrderLog extends Model
{
    protected $table = 'order_logs';
    const UPDATED_AT = null;

    protected $fillable = [
        'service_order_id',
        'user_id',
        'type',
        'previous_status_id',
        'new_status_id',
        'quote_id',
        'warranty_id',
        'description',
        'visible_to_customer',
    ];

    protected $casts = [
        'visible_to_customer' => 'boolean',
    ];

    public function previousStatus(): BelongsTo
    {
        return $this->belongsTo(OrderStatus::class, 'previous_status_id');
    }

    public function newStatus(): BelongsTo
    {
        return $this->belongsTo(OrderStatus::class, 'new_status_id');
    }

    public function warranty(): BelongsTo
    {
        return $this->belongsTo(Warranty::class, 'warranty_id');
    }

    public function serviceOrder(): BelongsTo
    {
        return $this->belongsTo(ServiceOrder::class, 'service_order_id');
    }

    public function quote(): BelongsTo
    {
        return $this->belongsTo(Quote::class, 'quote_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
