<?php

namespace App\Services\Inventory;

use App\Exceptions\InsufficientStockException;
use App\Models\InventoryMovement;
use App\Models\PriceHistory;
use App\Models\Product;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Inventario unificado (RF-02, T-03): catálogo de productos y movimientos de stock.
 * Todo cambio de existencias pasa por move(), que es atómico (RNF-04) y deja
 * huella en el kardex (inventory_movements). El POS y el taller lo reutilizan.
 */
class InventoryService
{
    public function __construct(private readonly AuditService $audit) {}

    /**
     * Mueve el stock de un producto de forma atómica.
     * $quantity es positivo para entradas y negativo para salidas.
     *
     * @param  array{sale_id?: int, service_order_id?: int, purchase_id?: int, sale_return_id?: int, reference_id?: int}  $refs
     */
    public function move(
        int $productId,
        string $type,
        int $quantity,
        User $by,
        ?string $reason = null,
        array $refs = [],
        ?User $authorizedBy = null,
    ): InventoryMovement {
        if ($quantity === 0) {
            throw ValidationException::withMessages(['quantity' => 'La cantidad no puede ser cero.']);
        }

        return DB::transaction(function () use ($productId, $type, $quantity, $by, $reason, $refs, $authorizedBy) {
            // Bloqueo de la fila: si caja y taller usan la misma pieza al mismo tiempo, uno espera al otro
            $product = Product::lockForUpdate()->findOrFail($productId);

            $newStock = $product->stock + $quantity;

            if ($newStock < 0) {
                throw new InsufficientStockException($product->name, $product->stock, abs($quantity));
            }

            $movement = InventoryMovement::create($refs + [
                'product_id' => $product->id,
                'user_id' => $by->id,
                'authorized_by' => $authorizedBy?->id,
                'type' => $type,
                'quantity' => $quantity,
                'previous_stock' => $product->stock,
                'new_stock' => $newStock,
                'reason' => $reason,
            ]);

            $product->stock = $newStock;
            $product->save(); // StockObserver avisa si cruzó el stock mínimo

            return $movement;
        });
    }

    /**
     * Alta de producto (C7.2). Si trae existencia inicial, entra como movimiento de entrada.
     *
     * @param  array<string, mixed>  $data
     */
    public function createProduct(array $data, User $by): Product
    {
        $initialStock = (int) ($data['initial_stock'] ?? 0);
        unset($data['initial_stock']);

        $product = DB::transaction(function () use ($data, $by, $initialStock) {
            $product = Product::create(['stock' => 0] + $data);

            if ($initialStock > 0) {
                $this->move($product->id, 'stock_in', $initialStock, $by, 'Existencia inicial al dar de alta el producto');
            }

            return $product;
        });

        $this->audit->log('inventory', 'product_created', "Alta de producto {$product->sku} · {$product->name}", $by->id, 'products', $product->id);

        return $product->fresh('category');
    }

    /**
     * Edición del producto (AD4 / C7). Cada cambio de costo o precio queda en price_histories.
     * El stock nunca se edita aquí: solo con entradas o ajustes.
     *
     * @param  array<string, mixed>  $data
     */
    public function updateProduct(Product $product, array $data, User $by): Product
    {
        $reason = $data['price_change_reason'] ?? null;
        unset($data['price_change_reason'], $data['stock']);

        DB::transaction(function () use ($product, $data, $by, $reason) {
            $oldPurchase = (float) $product->purchase_price;
            $oldSale = (float) $product->sale_price;

            $product->fill($data)->save();

            if ($product->wasChanged(['purchase_price', 'sale_price'])) {
                PriceHistory::create([
                    'product_id' => $product->id,
                    'user_id' => $by->id,
                    'old_purchase_price' => $oldPurchase,
                    'new_purchase_price' => $product->purchase_price,
                    'old_sale_price' => $oldSale,
                    'new_sale_price' => $product->sale_price,
                    'reason' => $reason,
                ]);
            }
        });

        $this->audit->log('inventory', 'product_updated', "Edición de producto {$product->sku}", $by->id, 'products', $product->id,
            null, $product->getChanges() ?: null);

        return $product->fresh('category');
    }

    /** C7.3 Entrada de mercancía sin factura de proveedor (con factura será el módulo de Compras). */
    public function stockIn(int $productId, int $quantity, User $by, ?string $reason): InventoryMovement
    {
        return $this->move($productId, 'stock_in', $quantity, $by, $reason);
    }

    /**
     * C7.4 Ajuste por conteo físico: deja el stock igual a lo contado.
     * Si falta mercancía y se marca como merma, el movimiento queda como "shrinkage".
     */
    public function adjust(int $productId, int $countedStock, string $reason, User $by, bool $isShrinkage = false): InventoryMovement
    {
        // La diferencia se calcula con la fila bloqueada, para que una venta simultánea no la deje vieja
        [$movement, $difference] = DB::transaction(function () use ($productId, $countedStock, $reason, $by, $isShrinkage) {
            $current = (int) Product::lockForUpdate()->findOrFail($productId)->stock;
            $difference = $countedStock - $current;

            if ($difference === 0) {
                throw ValidationException::withMessages(['counted_stock' => 'El conteo coincide con el sistema; no hay nada que ajustar.']);
            }

            $type = $isShrinkage && $difference < 0 ? 'shrinkage' : 'adjustment';

            return [$this->move($productId, $type, $difference, $by, $reason), $difference];
        });

        $this->audit->log('inventory', 'stock_adjusted', "Ajuste de inventario ({$difference}): {$reason}", $by->id, 'products', $productId);

        return $movement;
    }
}
