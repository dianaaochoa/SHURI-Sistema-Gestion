<?php

namespace App\Http\Requests\Pos;

use Illuminate\Foundation\Http\FormRequest;

/**
 * C2 Cobro en el punto de venta. Cada renglón es un producto o una orden
 * de taller por entregar; los precios los pone el servidor, no el cliente.
 */
class CheckoutRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // la ruta ya exige permission:pos.sell
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],

            'items' => ['required', 'array', 'min:1', 'max:50'],
            'items.*.type' => ['required', 'in:product,service_order'],
            'items.*.product_id' => ['required_if:items.*.type,product', 'nullable', 'integer'],
            'items.*.quantity' => ['nullable', 'integer', 'min:1', 'max:999'],
            'items.*.discount_pct' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.folio' => ['required_if:items.*.type,service_order', 'nullable', 'string', 'max:20'],
            'items.*.picked_up_by_name' => ['nullable', 'string', 'max:150'],

            'payments' => ['nullable', 'array', 'max:5'],
            'payments.*.method' => ['required', 'in:cash,card,transfer'],
            'payments.*.amount' => ['required', 'numeric', 'min:0.01', 'max:999999.99'],
            'payments.*.amount_received' => ['nullable', 'numeric', 'min:0', 'max:999999.99'],
            'payments.*.reference' => ['nullable', 'string', 'max:80'],
            'payments.*.card_last4' => ['nullable', 'digits:4'],

            // RF-14: clave de un superior cuando el descuento supera el máximo del usuario
            'authorization' => ['nullable', 'array'],
            'authorization.username' => ['required_with:authorization', 'string', 'max:40'],
            'authorization.code' => ['required_with:authorization', 'string', 'max:50'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'customer_id' => 'cliente',
            'items' => 'productos',
            'items.*.product_id' => 'producto',
            'items.*.quantity' => 'cantidad',
            'items.*.discount_pct' => 'descuento',
            'items.*.folio' => 'folio de la orden',
            'payments' => 'pagos',
            'payments.*.method' => 'forma de pago',
            'payments.*.amount' => 'monto',
            'payments.*.amount_received' => 'efectivo recibido',
            'payments.*.card_last4' => 'últimos 4 dígitos',
            'authorization.username' => 'usuario que autoriza',
            'authorization.code' => 'clave de autorización',
        ];
    }
}
