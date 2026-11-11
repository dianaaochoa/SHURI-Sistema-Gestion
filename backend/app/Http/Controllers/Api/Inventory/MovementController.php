<?php

namespace App\Http\Controllers\Api\Inventory;

use App\Http\Controllers\Controller;
use App\Http\Resources\InventoryMovementResource;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use App\Repositories\Contracts\InventoryRepositoryInterface;
use App\Services\Inventory\InventoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Movimientos de inventario: kardex (C7.6), entradas (C7.3) y ajustes (C7.4).
 */
class MovementController extends Controller
{
    public function __construct(
        private readonly InventoryRepositoryInterface $inventory,
        private readonly InventoryService $service,
    ) {}

    /** GET /inventory/movements?product_id=&type=&from=&to= */
    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'product_id' => ['nullable', 'integer'],
            'type' => ['nullable', 'in:stock_in,adjustment,sale,workshop_use,sale_return,workshop_return,supplier_return,shrinkage'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
        ]);

        return InventoryMovementResource::collection($this->inventory->paginateMovements($filters, (int) ($filters['per_page'] ?? 30)));
    }

    /** POST /inventory/stock-in — C7.3 entrada de mercancía */
    public function stockIn(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'quantity' => ['required', 'integer', 'min:1', 'max:100000'],
            'reason' => ['nullable', 'string', 'max:255'],
        ], [], ['product_id' => 'producto', 'quantity' => 'cantidad', 'reason' => 'nota']);

        $movement = $this->service->stockIn($data['product_id'], $data['quantity'], $request->user(), $data['reason'] ?? null);

        return $this->respond($movement->product_id, $movement, "Entraron {$data['quantity']} pieza(s).");
    }

    /** POST /inventory/adjustments — C7.4 ajuste por conteo físico */
    public function adjust(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'counted_stock' => ['required', 'integer', 'min:0', 'max:100000'],
            'reason' => ['required', 'string', 'max:255'],
            'is_shrinkage' => ['sometimes', 'boolean'],
        ], [], ['product_id' => 'producto', 'counted_stock' => 'existencia contada', 'reason' => 'motivo del ajuste']);

        $movement = $this->service->adjust(
            $data['product_id'],
            $data['counted_stock'],
            $data['reason'],
            $request->user(),
            (bool) ($data['is_shrinkage'] ?? false),
        );

        return $this->respond($movement->product_id, $movement, 'Inventario ajustado.');
    }

    private function respond(int $productId, $movement, string $message): JsonResponse
    {
        return response()->json([
            'message' => $message,
            'movement' => new InventoryMovementResource($movement),
            'product' => new ProductResource(Product::with('category')->find($productId)),
        ], 201);
    }
}
