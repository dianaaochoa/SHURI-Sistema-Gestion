<?php

namespace App\Repositories\Contracts;

use App\Models\ServiceOrder;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Collection;

/**
 * Patrón Repository (README §8.3): los servicios y controladores piden
 * las órdenes de servicio a este contrato en lugar de escribir consultas de Eloquent.
 */
interface OrderRepositoryInterface
{
    /** @param  array<string, mixed>  $attributes */
    public function create(array $attributes): ServiceOrder;

    public function findByFolio(string $folio): ?ServiceOrder;

    /**
     * Filtros: search (folio, cliente, teléfono, equipo), status (código),
     * technician_id, unassigned (bool), active (bool: que no esté en un estado final).
     *
     * @param  array<string, mixed>  $filters
     */
    public function paginate(array $filters, int $perPage = 20): LengthAwarePaginator;

    /**
     * Todas las órdenes de un cliente con sus relaciones (portal P1/P2), la más reciente primero.
     *
     * @return Collection<int, ServiceOrder>
     */
    public function forCustomer(int $customerId): Collection;
}
