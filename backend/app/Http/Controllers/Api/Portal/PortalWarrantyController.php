<?php

namespace App\Http\Controllers\Api\Portal;

use App\Http\Controllers\Controller;
use App\Http\Resources\WarrantyResource;
use App\Models\ServiceOrder;
use App\Models\Warranty;
use App\Services\Workshop\WarrantyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Garantía en el portal del cliente (P3, "solo si se solicita"): pedirla,
 * seguirla y aceptar o rechazar el costo extra (RF-11).
 */
class PortalWarrantyController extends Controller
{
    public function __construct(private readonly WarrantyService $warranties) {}

    /** GET /portal/orders/{folio}/warranty — la garantía más reciente de la orden */
    public function show(Request $request, string $folio): JsonResponse
    {
        $warranty = Warranty::with('serviceOrder.device')
            ->whereHas('serviceOrder', fn ($q) => $q->where('folio', $folio)->where('customer_id', $request->user()->id))
            ->latest('id')
            ->first();

        return $warranty
            ? response()->json(['data' => new WarrantyResource($warranty)])
            : response()->json(['message' => 'Este equipo no tiene garantías solicitadas.', 'code' => 'NOT_FOUND'], 404);
    }

    /** POST /portal/orders/{folio}/warranty — solicitar la garantía */
    public function store(Request $request, string $folio): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:2000']], [], ['reason' => 'qué falla presenta tu equipo']);

        $order = ServiceOrder::where('folio', $folio)->where('customer_id', $request->user()->id)->first();

        if (! $order) {
            return response()->json(['message' => "No encontramos el folio {$folio} en tu cuenta.", 'code' => 'NOT_FOUND'], 404);
        }

        $warranty = $this->warranties->request($order, $data['reason'], customer: $request->user());

        return response()->json([
            'message' => "Solicitaste la garantía {$warranty->folio}. Trae tu equipo a la sucursal para revisarlo.",
            'data' => new WarrantyResource($warranty->load('serviceOrder.device')),
        ], 201);
    }

    /** POST /portal/warranties/{folio}/answer — aceptar o rechazar el costo extra */
    public function answer(Request $request, string $folio): JsonResponse
    {
        $data = $request->validate(['accept' => ['required', 'boolean']], [], ['accept' => 'respuesta']);

        $warranty = Warranty::where('folio', $folio)
            ->whereHas('serviceOrder', fn ($q) => $q->where('customer_id', $request->user()->id))
            ->first();

        if (! $warranty) {
            return response()->json(['message' => "No encontramos la garantía {$folio} en tu cuenta.", 'code' => 'NOT_FOUND'], 404);
        }

        $warranty = $this->warranties->answer($warranty, $request->user(), (bool) $data['accept']);

        return response()->json([
            'message' => $data['accept'] ? 'Aceptaste el costo; comenzaremos la reparación.' : 'No aceptaste el costo; puedes pasar por tu equipo.',
            'data' => new WarrantyResource($warranty->load('serviceOrder.device')),
        ]);
    }
}
