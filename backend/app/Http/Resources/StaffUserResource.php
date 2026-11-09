<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Staff user as the Angular app sees it. The frontend uses `role.slug`
 * for routing guards and `permissions` to show or hide actions.
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
            'chat_available' => $this->chat_available,
            'last_login_at' => $this->last_login_at?->toIso8601String(),
        ];
    }
}
