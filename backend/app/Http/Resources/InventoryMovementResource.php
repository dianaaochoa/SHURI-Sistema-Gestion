<?php

namespace App\Http\Resources;

use App\Models\InventoryMovement;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Renglón del kardex (C7 Movimientos): cada entrada o salida con el stock antes y después.
 *
 * @mixin InventoryMovement
 */
class InventoryMovementResource extends JsonResource
{
    /** @var array<string, string> */
    private const TYPES = [
        'stock_in' => 'Entrada',
        'adjustment' => 'Ajuste',
        'sale' => 'Venta',
        'workshop_use' => 'Uso en taller',
        'sale_return' => 'Devolución de venta',
        'workshop_return' => 'Devolución del taller',
        'supplier_return' => 'Devolución a proveedor',
        'shrinkage' => 'Merma',
    ];

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'type_name' => self::TYPES[$this->type] ?? $this->type,
            'quantity' => $this->quantity,
            'previous_stock' => $this->previous_stock,
            'new_stock' => $this->new_stock,
            'reason' => $this->reason,
            'product' => $this->whenLoaded('product', fn () => ['id' => $this->product->id, 'sku' => $this->product->sku, 'name' => $this->product->name]),
            'user' => $this->whenLoaded('user', fn () => $this->user?->name),
            'service_order_folio' => $this->whenLoaded('serviceOrder', fn () => $this->serviceOrder?->folio),
            'sale_id' => $this->sale_id,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
