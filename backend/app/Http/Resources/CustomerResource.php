<?php

namespace App\Http\Resources;

use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Datos del cliente que se muestran en el portal (P1–P4). Nunca incluye la contraseña
 * ni la contraseña temporal cifrada.
 *
 * @mixin Customer
 */
class CustomerResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'last_name' => $this->last_name,
            'email' => $this->email,
            'phone' => $this->phone,
            'must_change_password' => $this->must_change_password,
            'has_security_question' => $this->security_answer_hash !== null,
            'last_login_at' => $this->last_login_at?->toIso8601String(),
        ];
    }
}
