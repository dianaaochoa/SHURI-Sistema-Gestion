<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Usuario del personal como lo ve Angular. El frontend usa `role.slug`
 * en los guards de rutas y `permissions` para mostrar u ocultar acciones.
 *
 * @mixin User
 */
class StaffUserResource extends JsonResource
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
            'role' => [
                'slug' => $this->role?->slug,
                'name' => $this->role?->name,
            ],
            'permissions' => $this->permissionCodes(),
            'max_discount_pct' => (float) $this->max_discount_pct,
            'cash_register_id' => $this->cash_register_id,
            'must_change_password' => $this->must_change_password,
            'is_locked' => (bool) $this->locked_until?->isFuture(),
            'has_security_question' => $this->security_answer_hash !== null,
            'two_factor_enabled' => $this->two_factor_enabled,
            'chat_available' => $this->chat_available,
            'last_login_at' => $this->last_login_at?->toIso8601String(),
        ];
    }
}
