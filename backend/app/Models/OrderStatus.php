<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla: order_statuses (original en español: estados_orden)
 */
class OrderStatus extends Model
{
    protected $table = 'order_statuses';
    protected $primaryKey = 'id';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'code',
        'name',
        'customer_message',
        'color_hex',
        'sort_order',
        'portal_step',
        'is_final',
        'allows_work',
        'awaiting_pickup',
    ];

    protected $casts = [
        'is_final' => 'boolean',
        'allows_work' => 'boolean',
        'awaiting_pickup' => 'boolean',
    ];

    public function previousStatusOrderLogs(): HasMany
    {
        return $this->hasMany(OrderLog::class, 'previous_status_id');
    }

    public function newStatusOrderLogs(): HasMany
    {
        return $this->hasMany(OrderLog::class, 'new_status_id');
    }

    public function serviceOrders(): HasMany
    {
        return $this->hasMany(ServiceOrder::class, 'status_id');
    }
}
