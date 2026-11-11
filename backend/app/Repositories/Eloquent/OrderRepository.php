<?php

namespace App\Repositories\Eloquent;

use App\Models\OrderStatus;
use App\Models\ServiceOrder;
use App\Repositories\Contracts\OrderRepositoryInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;

class OrderRepository implements OrderRepositoryInterface
{
    /** Relations every order screen needs (avoids N+1 queries). */
    private const WITH = ['status', 'customer', 'device', 'technician', 'receivedBy'];

    public function create(array $attributes): ServiceOrder
    {
        return ServiceOrder::create($attributes)->load(self::WITH);
    }

    public function findByFolio(string $folio): ?ServiceOrder
    {
        return ServiceOrder::with(self::WITH)->where('folio', $folio)->first();
    }

    public function paginate(array $filters, int $perPage = 20): LengthAwarePaginator
    {
        return ServiceOrder::with(self::WITH)
            ->when($filters['search'] ?? null, fn (Builder $q, string $search) => $this->search($q, $search))
            ->when($filters['status'] ?? null, fn (Builder $q, string $code) => $q->whereHas('status', fn ($s) => $s->where('code', $code)))
            ->when($filters['technician_id'] ?? null, fn (Builder $q, int $id) => $q->where('technician_id', $id))
            ->when($filters['unassigned'] ?? false, fn (Builder $q) => $q->whereNull('technician_id'))
            ->when($filters['active'] ?? false, fn (Builder $q) => $q->whereHas('status', fn ($s) => $s->where('is_final', false)
                ->whereNotIn('code', [OrderStatus::ABANDONED])))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($perPage);
    }

    private function search(Builder $query, string $search): Builder
    {
        $like = '%'.addcslashes($search, '%_\\').'%';

        return $query->where(fn (Builder $q) => $q
            ->where('folio', 'like', $like)
            ->orWhereHas('customer', fn ($c) => $c
                ->where('name', 'like', $like)
                ->orWhere('last_name', 'like', $like)
                ->orWhere('phone', 'like', $like)
                ->orWhere('email', 'like', $like))
            ->orWhereHas('device', fn ($d) => $d
                ->where('brand', 'like', $like)
                ->orWhere('model', 'like', $like)
                ->orWhere('serial_number', 'like', $like)));
    }
}
