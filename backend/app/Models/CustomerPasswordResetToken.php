<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabla: customer_password_reset_tokens (original en español: cliente_password_reset_tokens)
 */
class CustomerPasswordResetToken extends Model
{
    protected $table = 'customer_password_reset_tokens';
    const UPDATED_AT = null;

    protected $fillable = [
        'customer_id',
        'token_hash',
        'expires_at',
        'used_at',
    ];

    protected $hidden = [
        'token_hash',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'used_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }
}
