<?php

namespace App\Http\Controllers\Api\Portal;

use App\Http\Controllers\Controller;
use App\Http\Resources\PortalOrderResource;
use App\Repositories\Contracts\OrderRepositoryInterface;
use App\Services\Portal\PortalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Portal del cliente: mis equipos (P1), seguimiento de la reparación (P2)
 * e información de la sucursal (P4). RF-06.
 */
class PortalOrderController extends Controller
{
    public function __construct(
        private readonly PortalService $portal,
        private readonly OrderRepositoryInterface $orders,
    ) {}

    /**
     * GET /portal/orders?active=1 — resumen de sus equipos.
     * GET /portal/orders?include=detail — cada orden completa (presupuesto, garantía y bitácora
     * visible), la que usan las pantallas P1–P3.
     */
    public function index(Request $request): JsonResponse|AnonymousResourceCollection
    {
        $data = $request->validate([
            'active' => ['nullable', 'boolean'],
            'include' => ['nullable', 'in:detail'],
        ]);

        if (($data['include'] ?? null) === 'detail') {
            return PortalOrderResource::collection($this->orders->forCustomer($request->user()->id));
        }

        return response()->json([
            'data' => $this->portal->myOrders($request->user(), (bool) ($data['active'] ?? false)),
        ]);
    }

    /** POST /portal/orders/{folio}/rating — P2.11 calificar el servicio (una vez, ya entregado) */
    public function rate(Request $request, string $folio): JsonResponse
    {
        $data = $request->validate([
            'stars' => ['required', 'integer', 'min:1', 'max:5'],
            'tags' => ['nullable', 'array', 'max:10'],
            'tags.*' => ['string', 'max:40'],
            'comment' => ['nullable', 'string', 'max:300'],
        ], [], ['stars' => 'calificación', 'tags' => 'lo que te gustó', 'comment' => 'comentario']);

        $order = $this->orders->findByFolio($folio);

        if (! $order || $order->customer_id !== $request->user()->id) {
            return response()->json(['message' => "No encontramos el folio {$folio} en tu cuenta.", 'code' => 'NOT_FOUND'], 404);
        }

        $this->portal->rate($order, (int) $data['stars'], $data['tags'] ?? [], $data['comment'] ?? null);

        return response()->json([
            'message' => '¡Gracias por calificar tu servicio!',
            'data' => new PortalOrderResource($this->orders->findByFolio($folio)),
        ]);
    }

    /** GET /portal/orders/{folio} */
    public function show(Request $request, string $folio): JsonResponse
    {
        $order = $this->portal->findMine($request->user(), $folio);

        // 404 aunque el folio exista: no se confirma que pertenece a otra persona
        if (! $order) {
            return response()->json(['message' => "No encontramos el folio {$folio} en tu cuenta.", 'code' => 'NOT_FOUND'], 404);
        }

        return response()->json(['data' => $order]);
    }

    /** GET /portal/info — dirección, horario y políticas (P4, riesgo R14) */
    public function info(): JsonResponse
    {
        return response()->json(['data' => $this->portal->info()]);
    }
}
