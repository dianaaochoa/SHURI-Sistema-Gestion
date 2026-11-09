<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabla: order_time_logs (original en español: orden_tiempos)
 */
class OrderTimeLog extends Model
{
    protected $table = 'order_time_logs';
    public $timestamps = false;

    protected $fillable = [
        'service_order_id',
        'technician_id',
        'type',
        'starts_at',
        'ends_at',
        'pause_reason',
    ];

    protected $casts = [
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
    ];

    public function serviceOrder(): BelongsTo
    {
        return $this->belongsTo(ServiceOrder::class, 'service_order_id');
    }

    public function technician(): BelongsTo
    {
        return $this->belongsTo(User::class, 'technician_id');
    }
}
