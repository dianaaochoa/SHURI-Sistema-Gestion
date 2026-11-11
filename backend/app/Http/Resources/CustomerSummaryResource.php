<?php

namespace App\Http\Resources;

use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Cliente como lo ve el mostrador (C5 búsqueda, C8 lista).
 * Nunca incluye contraseñas ni la contraseña temporal cifrada.
 *
 * @mixin Customer
 */
class CustomerSummaryResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'last_name' => $this->last_name,
            'phone' => $this->phone,
            'email' => $this->email,
            'has_portal_password' => $this->password !== null && ! $this->must_change_password,
            'service_orders_count' => $this->whenCounted('serviceOrders'),
            'devices' => $this->whenLoaded('devices', fn () => $this->devices->map(fn ($d) => [
                'id' => $d->id,
                'type' => $d->type,
                'brand' => $d->brand,
                'model' => $d->model,
                'serial_number' => $d->serial_number,
                'color' => $d->color,
            ])),
        ];
    }
}
