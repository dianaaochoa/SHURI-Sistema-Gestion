<?php

namespace App\Repositories\Contracts;

use App\Models\Product;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

/**
 * Patrón Repository (README §8.3): consultas del catálogo y del kardex
 * fuera de los controladores y servicios.
 */
interface InventoryRepositoryInterface
{
    /**
     * Filtros: search (nombre, SKU, código de barras, marca, compatible con),
     * category_id, type, low_stock (bool), sellable (bool), workshop (bool), include_inactive (bool).
     *
     * @param  array<string, mixed>  $filters
     */
    public function paginateProducts(array $filters, int $perPage = 20): LengthAwarePaginator;

    public function findProduct(int $id): ?Product;

    /**
     * Kardex. Filtros: product_id, type, from, to (fechas).
     *
     * @param  array<string, mixed>  $filters
     */
    public function paginateMovements(array $filters, int $perPage = 30): LengthAwarePaginator;
}
