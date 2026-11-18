<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla: warranties (original en español: garantias)
 */
class Warranty extends Model
{
    protected $table = 'warranties';

    protected $fillable = [
        'folio',
        'service_order_id',
        'customer_id',
        'request_channel',
        'customer_reason',
        'status',
        'received_by',
        'received_at',
        'technician_id',
        'technician_review',
        'ruling',
        'ruled_by',
        'ruled_at',
        'ruling_reason',
        'extra_cost',
        'extra_cost_accepted',
        'answered_at',
        'finished_at',
        'delivered_by',
        'delivered_at',
    ];

    protected $casts = [
        'received_at' => 'datetime',
        'ruled_at' => 'datetime',
        'extra_cost' => 'decimal:2',
        'extra_cost_accepted' => 'boolean',
        'answered_at' => 'datetime',
        'finished_at' => 'datetime',
        'delivered_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    public function ruledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'ruled_by');
    }

    public function deliveredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delivered_by');
    }

    public function serviceOrder(): BelongsTo
    {
        return $this->belongsTo(ServiceOrder::class, 'service_order_id');
    }

    public function receivedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public function technician(): BelongsTo
    {
        return $this->belongsTo(User::class, 'technician_id');
    }

    public function orderLogs(): HasMany
    {
        return $this->hasMany(OrderLog::class, 'warranty_id');
    }

    public function orderFiles(): HasMany
    {
        return $this->hasMany(OrderFile::class, 'warranty_id');
    }
}
