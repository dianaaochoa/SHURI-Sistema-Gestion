<?php

namespace App\Repositories\Contracts;

use App\Models\ServiceOrder;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

/**
 * Repository pattern (README §8.3): services and controllers ask for
 * service orders through this contract instead of writing Eloquent queries.
 */
interface OrderRepositoryInterface
{
    /** @param  array<string, mixed>  $attributes */
    public function create(array $attributes): ServiceOrder;

    public function findByFolio(string $folio): ?ServiceOrder;

    /**
     * Filters: search (folio, customer, phone, device), status (code),
     * technician_id, unassigned (bool), active (bool: not in a final state).
     *
     * @param  array<string, mixed>  $filters
     */
    public function paginate(array $filters, int $perPage = 20): LengthAwarePaginator;
}
