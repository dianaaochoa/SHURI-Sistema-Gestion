<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabla: part_returns (original en español: devoluciones_refaccion)
 */
class PartReturn extends Model
{
    protected $table = 'part_returns';

    protected $fillable = [
        'order_part_id',
        'technician_id',
        'quantity',
        'reason',
        'status',
        'condition',
        'returns_to_stock',
        'received_by',
        'received_at',
    ];

    protected $casts = [
        'returns_to_stock' => 'boolean',
        'received_at' => 'datetime',
    ];

    public function orderPart(): BelongsTo
    {
        return $this->belongsTo(OrderPart::class, 'order_part_id');
    }

    public function receivedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public function technician(): BelongsTo
    {
        return $this->belongsTo(User::class, 'technician_id');
    }
}
