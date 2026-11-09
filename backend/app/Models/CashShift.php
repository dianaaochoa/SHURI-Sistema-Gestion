<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla: cash_shifts (original en español: turnos_caja)
 */
class CashShift extends Model
{
    protected $table = 'cash_shifts';

    protected $fillable = [
        'folio',
        'cash_register_id',
        'user_id',
        'shift',
        'opened_at',
        'opening_amount',
        'closed_at',
        'closed_by',
        'expected_cash',
        'counted_cash',
        'card_total',
        'transfer_total',
        'cash_left',
        'cash_handed_over',
        'received_by',
        'closing_notes',
        'status',
        'reviewed_by',
        'reviewed_at',
        'review_comment',
    ];

    protected $casts = [
        'opened_at' => 'datetime',
        'opening_amount' => 'decimal:2',
        'closed_at' => 'datetime',
        'expected_cash' => 'decimal:2',
        'counted_cash' => 'decimal:2',
        'difference' => 'decimal:2',
        'card_total' => 'decimal:2',
        'transfer_total' => 'decimal:2',
        'cash_left' => 'decimal:2',
        'cash_handed_over' => 'decimal:2',
        'reviewed_at' => 'datetime',
    ];

    public function cashRegister(): BelongsTo
    {
        return $this->belongsTo(CashRegister::class, 'cash_register_id');
    }

    public function closedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by');
    }

    public function receivedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function saleReturns(): HasMany
    {
        return $this->hasMany(SaleReturn::class, 'cash_shift_id');
    }

    public function cashMovements(): HasMany
    {
        return $this->hasMany(CashMovement::class, 'cash_shift_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class, 'cash_shift_id');
    }

    public function supplierPayments(): HasMany
    {
        return $this->hasMany(SupplierPayment::class, 'cash_shift_id');
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class, 'cash_shift_id');
    }
}
