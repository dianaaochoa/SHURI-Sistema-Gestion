<?php

namespace App\Http\Resources;

use App\Models\Product;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Producto del catálogo. El costo y la utilidad solo los ve quien tiene
 * el permiso catalog.view_costs (administrador y jefe de técnicos).
 *
 * @mixin Product
 */
class ProductResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $user = $request->user();
        $canSeeCosts = $user instanceof User && $user->hasPermission('catalog.view_costs');

        return [
            'id' => $this->id,
            'sku' => $this->sku,
            'barcode' => $this->barcode,
            'name' => $this->name,
            'brand' => $this->brand,
            'compatible_with' => $this->compatible_with,
            'description' => $this->description,
            'type' => $this->type,
            'category' => $this->whenLoaded('category', fn () => ['id' => $this->category->id, 'name' => $this->category->name]),
            'sellable_at_counter' => (bool) $this->sellable_at_counter,
            'usable_in_workshop' => (bool) $this->usable_in_workshop,
            'sale_price' => (float) $this->sale_price,
            'purchase_price' => $this->when($canSeeCosts, fn () => (float) $this->purchase_price),
            'margin' => $this->when($canSeeCosts, fn () => round((float) $this->sale_price - (float) $this->purchase_price, 2)),
            'stock' => $this->stock,
            'min_stock' => $this->min_stock,
            'is_low_stock' => $this->stock <= $this->min_stock,
            'location' => $this->location,
            'is_active' => (bool) $this->is_active,
        ];
    }
}
