<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabla: cash_movements (original en español: movimientos_caja)
 */
class CashMovement extends Model
{
    protected $table = 'cash_movements';
    const UPDATED_AT = null;

    protected $fillable = [
        'folio',
        'cash_shift_id',
        'user_id',
        'type',
        'amount',
        'reason',
        'cash_before',
        'cash_after',
        'received_by',
        'authorized_by',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'cash_before' => 'decimal:2',
        'cash_after' => 'decimal:2',
    ];

    public function authorizedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'authorized_by');
    }

    public function receivedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public function cashShift(): BelongsTo
    {
        return $this->belongsTo(CashShift::class, 'cash_shift_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
