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
            'address' => $this->address,
            'city' => $this->city,
            'postal_code' => $this->postal_code,
            'notes' => $this->notes,
            'created_at' => $this->created_at?->toIso8601String(),
            'has_portal_password' => $this->password !== null && ! $this->must_change_password,
            // Cuándo se generó/vence la contraseña temporal del portal (C8 "Acceso al portal")
            'portal_temporary_expires_at' => $this->must_change_password ? $this->temporary_password_expires_at?->toIso8601String() : null,
            'service_orders_count' => $this->whenCounted('serviceOrders'),
            // En la lista (C8): equipos activos, última visita, total gastado y visitas
            'summary' => $this->when($this->resource->getAttribute('summary') !== null, fn () => $this->resource->getAttribute('summary')),
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
