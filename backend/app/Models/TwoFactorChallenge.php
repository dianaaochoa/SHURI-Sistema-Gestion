<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Prunable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabla: two_factor_challenges — accesos MFA pendientes (código enviado por correo).
 */
class TwoFactorChallenge extends Model
{
    use Prunable;

    protected $table = 'two_factor_challenges';

    const UPDATED_AT = null;

    protected $fillable = [
        'user_id',
        'challenge_hash',
        'code_hash',
        'device_name',
        'ip_address',
        'attempts',
        'expires_at',
        'last_sent_at',
        'consumed_at',
    ];

    protected $hidden = [
        'challenge_hash',
        'code_hash',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'last_sent_at' => 'datetime',
        'consumed_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** Se borran a diario con `php artisan model:prune` (programado en Console\Kernel). */
    public function prunable(): Builder
    {
        return static::where('expires_at', '<', now()->subDay());
    }

    /** Sin usar y sin vencer. */
    public function scopePending(Builder $query): Builder
    {
        return $query->whereNull('consumed_at')->where('expires_at', '>', now());
    }
}
