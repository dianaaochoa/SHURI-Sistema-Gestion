<?php

namespace App\Http\Requests\Inventory;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Alta (POST) y edición (PUT) de un producto del catálogo (C7.2 / AD4).
 * En la edición todos los campos son opcionales y el stock no se puede editar.
 */
class ProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // la ruta ya exige el permiso
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $productId = $this->route('product')?->id;
        $creating = $this->isMethod('post');
        $required = $creating ? 'required' : 'sometimes';

        return [
            'category_id' => [$required, 'integer', 'exists:categories,id'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'sku' => [$required, 'string', 'max:40', Rule::unique('products', 'sku')->ignore($productId)],
            'barcode' => ['nullable', 'string', 'max:50', Rule::unique('products', 'barcode')->ignore($productId)],
            'name' => [$required, 'string', 'max:150'],
            'brand' => ['nullable', 'string', 'max:60'],
            'compatible_with' => ['nullable', 'string', 'max:150'],
            'description' => ['nullable', 'string', 'max:255'],
            'type' => [$required, 'in:part,accessory,consumable'],
            'sellable_at_counter' => ['sometimes', 'boolean'],
            'usable_in_workshop' => ['sometimes', 'boolean'],
            'purchase_price' => [$required, 'numeric', 'min:0', 'max:999999.99'],
            'sale_price' => [$required, 'numeric', 'min:0', 'max:999999.99'],
            'min_stock' => ['sometimes', 'integer', 'min:0', 'max:100000'],
            'location' => ['nullable', 'string', 'max:40'],
            'is_active' => ['sometimes', 'boolean'],
            // Solo en el alta: existencia inicial (entra como movimiento al kardex)
            'initial_stock' => [$creating ? 'nullable' : 'prohibited', 'integer', 'min:0', 'max:100000'],
            // Solo en la edición: motivo del cambio de precio (price_histories)
            'price_change_reason' => ['nullable', 'string', 'max:255'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'category_id' => 'categoría',
            'supplier_id' => 'proveedor',
            'sku' => 'SKU',
            'barcode' => 'código de barras',
            'name' => 'nombre',
            'type' => 'tipo',
            'purchase_price' => 'costo',
            'sale_price' => 'precio de venta',
            'min_stock' => 'stock mínimo',
            'location' => 'ubicación',
            'initial_stock' => 'existencia inicial',
            'price_change_reason' => 'motivo del cambio de precio',
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('sku')) {
            $this->merge(['sku' => mb_strtoupper(trim((string) $this->input('sku')))]);
        }
    }
}
