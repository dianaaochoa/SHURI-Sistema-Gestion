<?php

namespace App\Http\Controllers\Api\Inventory;

use App\Http\Controllers\Controller;
use App\Http\Requests\Inventory\ProductRequest;
use App\Http\Resources\InventoryMovementResource;
use App\Http\Resources\ProductResource;
use App\Models\Category;
use App\Models\Product;
use App\Repositories\Contracts\InventoryRepositoryInterface;
use App\Services\Inventory\InventoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Catálogo de productos: refacciones, accesorios y consumibles (C7, J6, AD4).
 */
class ProductController extends Controller
{
    public function __construct(
        private readonly InventoryRepositoryInterface $inventory,
        private readonly InventoryService $service,
    ) {}

    /** GET /products?search=&category_id=&type=&low_stock=1&sellable=1&workshop=1 */
    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'category_id' => ['nullable', 'integer'],
            'type' => ['nullable', 'in:part,accessory,consumable'],
            'low_stock' => ['nullable', 'boolean'],
            'sellable' => ['nullable', 'boolean'],
            'workshop' => ['nullable', 'boolean'],
            'include_inactive' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
        ]);

        return ProductResource::collection($this->inventory->paginateProducts($filters, (int) ($filters['per_page'] ?? 20)));
    }

    /** GET /products/{product} — con sus últimos 10 movimientos */
    public function show(Product $product): JsonResponse
    {
        $movements = $this->inventory->paginateMovements(['product_id' => $product->id], 10);

        return response()->json([
            'data' => new ProductResource($product->load('category')),
            'recent_movements' => InventoryMovementResource::collection($movements->items()),
        ]);
    }

    /** POST /products — C7.2 alta de producto */
    public function store(ProductRequest $request): JsonResponse
    {
        $product = $this->service->createProduct($request->validated(), $request->user());

        return response()->json([
            'message' => "Producto {$product->sku} registrado.",
            'data' => new ProductResource($product),
        ], 201);
    }

    /** PUT /products/{product} — AD4 catálogo y precios */
    public function update(ProductRequest $request, Product $product): JsonResponse
    {
        $product = $this->service->updateProduct($product, $request->validated(), $request->user());

        return response()->json([
            'message' => 'Producto actualizado.',
            'data' => new ProductResource($product),
        ]);
    }

    /** GET /categories */
    public function categories(): JsonResponse
    {
        return response()->json([
            'data' => Category::orderBy('type')->orderBy('name')->get(['id', 'name', 'type']),
        ]);
    }
}
