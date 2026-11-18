<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Empleado en la lista de AD7 Usuarios y permisos. Nunca expone la contraseña
 * ni la clave de autorización; solo indica si la tiene.
 *
 * @mixin User
 */
class AdminUserResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'username' => $this->username,
            'email' => $this->email,
            'phone' => $this->phone,
            'role' => $this->whenLoaded('role', fn () => ['id' => $this->role->id, 'slug' => $this->role->slug, 'name' => $this->role->name]),
            'cash_register' => $this->whenLoaded('cashRegister', fn () => $this->cashRegister
                ? ['id' => $this->cashRegister->id, 'name' => $this->cashRegister->name]
                : null),
            'specialty' => $this->specialty,
            'shift' => $this->shift,
            'start_time' => $this->start_time ? substr($this->start_time, 0, 5) : null,
            'end_time' => $this->end_time ? substr($this->end_time, 0, 5) : null,
            'max_discount_pct' => (float) $this->max_discount_pct,
            'has_authorization_code' => $this->authorization_code !== null,
            'two_factor_enabled' => (bool) $this->two_factor_enabled,
            'is_active' => (bool) $this->is_active,
            'is_locked' => (bool) $this->locked_until?->isFuture(),
            'must_change_password' => (bool) $this->must_change_password,
            'last_login_at' => $this->last_login_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
