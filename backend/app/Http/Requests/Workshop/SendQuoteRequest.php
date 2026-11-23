<?php

namespace App\Http\Requests\Workshop;

use Illuminate\Foundation\Http\FormRequest;

/**
 * J3 Cotizar: el jefe arma el presupuesto. Refacciones y mano de obra toman
 * el precio del catálogo; solo "otro concepto" lleva precio manual.
 */
class SendQuoteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // la ruta ya exige permission:orders.quote
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'items' => ['required', 'array', 'min:1', 'max:30'],
            'items.*.type' => ['required', 'in:part,labor,other'],
            // Refacción: por id o por SKU del catálogo. Si el SKU no está registrado, se toma
            // la descripción y el precio que capturó el jefe (pieza fuera de catálogo)
            'items.*.product_id' => ['nullable', 'integer'],
            'items.*.sku' => ['nullable', 'string', 'max:40'],
            'items.*.quantity' => ['nullable', 'integer', 'min:1', 'max:99'],
            'items.*.labor_level_id' => ['required_if:items.*.type,labor', 'nullable', 'integer'],
            'items.*.concept' => ['required_if:items.*.type,other', 'nullable', 'string', 'max:150'],
            'items.*.unit_price' => ['required_if:items.*.type,other', 'nullable', 'numeric', 'min:0', 'max:999999.99'],
            'discount' => ['nullable', 'numeric', 'min:0', 'max:999999.99'],
            // J3.2 vigencia elegida por el jefe (si no, la de Configuración)
            'valid_days' => ['nullable', 'integer', 'min:1', 'max:60'],
            'warranty_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'customer_note' => ['nullable', 'string', 'max:1000'],
            'estimated_delivery_date' => ['nullable', 'date', 'after_or_equal:today'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'items' => 'conceptos',
            'items.*.type' => 'tipo de concepto',
            'items.*.product_id' => 'refacción',
            'items.*.sku' => 'SKU de la refacción',
            'valid_days' => 'vigencia',
            'items.*.quantity' => 'cantidad',
            'items.*.labor_level_id' => 'nivel de mano de obra',
            'items.*.concept' => 'concepto',
            'items.*.unit_price' => 'precio',
            'discount' => 'descuento',
            'warranty_days' => 'días de garantía',
            'customer_note' => 'nota para el cliente',
            'estimated_delivery_date' => 'fecha estimada de entrega',
        ];
    }
}
