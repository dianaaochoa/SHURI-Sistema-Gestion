<?php

namespace App\Http\Controllers\Api\Pos;

use App\Http\Controllers\Controller;
use App\Http\Requests\Pos\CheckoutRequest;
use App\Http\Resources\SaleResource;
use App\Models\Sale;
use App\Services\Pos\SaleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Punto de venta: cobro (C2), entrega de equipos (C6) y lista de ventas (C3).
 */
class SaleController extends Controller
{
    public function __construct(private readonly SaleService $sales) {}

    /** POST /sales — cobrar el ticket */
    public function store(CheckoutRequest $request): JsonResponse
    {
        $sale = $this->sales->checkout($request->user(), $request->validated());

        return response()->json([
            'message' => "Venta {$sale->folio} cobrada.",
            'data' => new SaleResource($sale),
        ], 201);
    }

    /** GET /sales?search=&from=&to= — la cajera ve sus ventas; con reports.view se ven todas */
    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:40'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'cash_shift_id' => ['nullable', 'integer'],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
        ]);

        $user = $request->user();

        $sales = Sale::with(['cashier', 'customer', 'payments'])
            ->when(! $user->hasPermission('reports.view'), fn ($q) => $q->where('cashier_id', $user->id))
            ->when($filters['search'] ?? null, fn ($q, $s) => $q->where('folio', 'like', '%'.addcslashes($s, '%_\\').'%'))
            ->when($filters['cash_shift_id'] ?? null, fn ($q, $id) => $q->where('cash_shift_id', $id))
            ->when($filters['from'] ?? null, fn ($q, $from) => $q->where('created_at', '>=', $from))
            ->when($filters['to'] ?? null, fn ($q, $to) => $q->where('created_at', '<', now()->parse($to)->addDay()))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate((int) ($filters['per_page'] ?? 20));

        return SaleResource::collection($sales);
    }

    /** GET /sales/{folio} — detalle del ticket (C3, C11) */
    public function show(Request $request, string $folio): JsonResponse
    {
        $user = $request->user();
        $sale = Sale::with(['saleItems', 'payments', 'cashier', 'customer', 'authorizedBy'])->where('folio', $folio)->first();

        if (! $sale || ($sale->cashier_id !== $user->id && ! $user->hasPermission('reports.view'))) {
            return response()->json(['message' => "No existe la venta {$folio}.", 'code' => 'NOT_FOUND'], 404);
        }

        return response()->json(['data' => new SaleResource($sale)]);
    }
}
