<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabla: role_substitutions (original en español: suplencias_rol)
 */
class RoleSubstitution extends Model
{
    protected $table = 'role_substitutions';

    protected $fillable = [
        'user_id',
        'role_id',
        'substitutes_user_id',
        'reason',
        'starts_at',
        'ends_at',
        'assigned_by',
        'revoked_by',
        'revoked_at',
    ];

    protected $casts = [
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    public function assignedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }

    public function revokedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'revoked_by');
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class, 'role_id');
    }

    public function substitutesUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'substitutes_user_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
