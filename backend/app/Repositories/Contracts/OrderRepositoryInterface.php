<?php

namespace App\Repositories\Contracts;

use App\Models\ServiceOrder;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

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
}
