<?php

namespace App\Repositories\Eloquent;

use App\Models\InventoryMovement;
use App\Models\Product;
use App\Repositories\Contracts\InventoryRepositoryInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;

class InventoryRepository implements InventoryRepositoryInterface
{
    public function paginateProducts(array $filters, int $perPage = 20): LengthAwarePaginator
    {
        return Product::with('category')
            ->when(! ($filters['include_inactive'] ?? false), fn (Builder $q) => $q->where('is_active', true))
            ->when($filters['search'] ?? null, function (Builder $q, string $search) {
                $like = '%'.addcslashes($search, '%_\\').'%';
                $q->where(fn (Builder $w) => $w
                    ->where('name', 'like', $like)
                    ->orWhere('sku', $search)
                    ->orWhere('barcode', $search)
                    ->orWhere('brand', 'like', $like)
                    ->orWhere('compatible_with', 'like', $like));
            })
            ->when($filters['category_id'] ?? null, fn (Builder $q, int $id) => $q->where('category_id', $id))
            ->when($filters['type'] ?? null, fn (Builder $q, string $type) => $q->where('type', $type))
            ->when($filters['low_stock'] ?? false, fn (Builder $q) => $q->whereColumn('stock', '<=', 'min_stock'))
            ->when($filters['sellable'] ?? false, fn (Builder $q) => $q->where('sellable_at_counter', true))
            ->when($filters['workshop'] ?? false, fn (Builder $q) => $q->where('usable_in_workshop', true))
            ->orderBy('name')
            ->paginate($perPage);
    }

    public function findProduct(int $id): ?Product
    {
        return Product::with('category')->find($id);
    }

    public function paginateMovements(array $filters, int $perPage = 30): LengthAwarePaginator
    {
        return InventoryMovement::with(['product:id,sku,name', 'user:id,name', 'serviceOrder:id,folio'])
            ->when($filters['product_id'] ?? null, fn (Builder $q, int $id) => $q->where('product_id', $id))
            ->when($filters['type'] ?? null, fn (Builder $q, string $type) => $q->where('type', $type))
            ->when($filters['from'] ?? null, fn (Builder $q, string $from) => $q->where('created_at', '>=', $from))
            ->when($filters['to'] ?? null, fn (Builder $q, string $to) => $q->where('created_at', '<', now()->parse($to)->addDay()))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($perPage);
    }
}
