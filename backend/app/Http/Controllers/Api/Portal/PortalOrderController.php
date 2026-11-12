<?php

namespace App\Http\Controllers\Api\Portal;

use App\Http\Controllers\Controller;
use App\Services\Portal\PortalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Portal del cliente: mis equipos (P1), seguimiento de la reparación (P2)
 * e información de la sucursal (P4). RF-06.
 */
class PortalOrderController extends Controller
{
    public function __construct(private readonly PortalService $portal) {}

    /** GET /portal/orders?active=1 */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['active' => ['nullable', 'boolean']]);

        return response()->json([
            'data' => $this->portal->myOrders($request->user(), (bool) ($data['active'] ?? false)),
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
