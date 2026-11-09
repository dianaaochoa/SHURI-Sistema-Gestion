<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Prunable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabla: two_factor_challenges — pending MFA logins (code sent by email).
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

    /** Deleted daily by `php artisan model:prune` (scheduled in Console\Kernel). */
    public function prunable(): Builder
    {
        return static::where('expires_at', '<', now()->subDay());
    }

    /** Not used yet and not expired. */
    public function scopePending(Builder $query): Builder
    {
        return $query->whereNull('consumed_at')->where('expires_at', '>', now());
    }
}
