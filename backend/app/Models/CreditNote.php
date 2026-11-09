<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla: credit_notes (original en español: notas_credito)
 */
class CreditNote extends Model
{
    protected $table = 'credit_notes';

    protected $fillable = [
        'folio',
        'customer_id',
        'amount',
        'balance',
        'valid_until',
        'status',
        'created_by',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'balance' => 'decimal:2',
        'valid_until' => 'date',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function saleReturns(): HasMany
    {
        return $this->hasMany(SaleReturn::class, 'credit_note_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class, 'credit_note_id');
    }
}
