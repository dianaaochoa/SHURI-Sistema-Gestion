<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla: quotes (original en español: presupuestos)
 */
class Quote extends Model
{
    protected $table = 'quotes';

    protected $fillable = [
        'folio',
        'service_order_id',
        'customer_id',
        'type',
        'device_description',
        'technician_id',
        'diagnosis',
        'failure_cause',
        'labor_level_id',
        'estimated_minutes',
        'is_urgent',
        'technician_notes',
        'customer_note',
        'return_reason',
        'estimated_delivery_date',
        'labor_amount',
        'parts_amount',
        'discount',
        'warranty_days',
        'valid_until',
        'status',
        'quoted_by',
        'quoted_at',
        'sent_at',
        'response_channel',
        'answered_by',
        'customer_comment',
        'answered_at',
        'response_ip',
        'created_by',
    ];

    protected $casts = [
        'is_urgent' => 'boolean',
        'estimated_delivery_date' => 'date',
        'labor_amount' => 'decimal:2',
        'parts_amount' => 'decimal:2',
        'discount' => 'decimal:2',
        'total' => 'decimal:2',
        'valid_until' => 'date',
        'quoted_at' => 'datetime',
        'sent_at' => 'datetime',
        'answered_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    public function quotedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'quoted_by');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function laborLevel(): BelongsTo
    {
        return $this->belongsTo(LaborLevel::class, 'labor_level_id');
    }

    public function serviceOrder(): BelongsTo
    {
        return $this->belongsTo(ServiceOrder::class, 'service_order_id');
    }

    public function answeredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'answered_by');
    }

    public function technician(): BelongsTo
    {
        return $this->belongsTo(User::class, 'technician_id');
    }

    public function orderLogs(): HasMany
    {
        return $this->hasMany(OrderLog::class, 'quote_id');
    }

    public function orderFiles(): HasMany
    {
        return $this->hasMany(OrderFile::class, 'quote_id');
    }

    public function quoteItems(): HasMany
    {
        return $this->hasMany(QuoteItem::class, 'quote_id');
    }
}
