<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla: roles (original en español: roles)
 */
class Role extends Model
{
    protected $table = 'roles';

    protected $fillable = [
        'slug',
        'name',
        'description',
    ];

    protected $casts = [];

    public function roleSubstitutions(): HasMany
    {
        return $this->hasMany(RoleSubstitution::class, 'role_id');
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class, 'role_id');
    }

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'permission_role')->withPivot('limit_pct', 'scope');
    }
}
