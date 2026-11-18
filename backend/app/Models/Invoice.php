<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla: invoices (original en español: facturas)
 */
class Invoice extends Model
{
    protected $table = 'invoices';

    protected $fillable = [
        'series',
        'number',
        'sat_uuid',
        'type',
        'period',
        'customer_id',
        'rfc',
        'business_name',
        'tax_regime',
        'postal_code',
        'cfdi_use',
        'payment_form',
        'payment_method',
        'subtotal',
        'tax',
        'total',
        'status',
        'origin',
        'xml_path',
        'pdf_path',
        'issued_by',
        'issued_at',
        'cancelled_by',
        'cancelled_at',
        'cancellation_reason',
        'replaced_by',
    ];

    protected $casts = [
        'subtotal' => 'decimal:2',
        'tax' => 'decimal:2',
        'total' => 'decimal:2',
        'issued_at' => 'datetime',
        'cancelled_at' => 'datetime',
    ];

    public function cancelledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    public function issuedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'issued_by');
    }

    public function replacedBy(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'replaced_by');
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class, 'replaced_by');
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class, 'invoice_id');
    }
}
