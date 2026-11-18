<?php

namespace App\Http\Controllers\Api\Workshop;

use App\Http\Controllers\Controller;
use App\Http\Requests\Workshop\DiagnosisRequest;
use App\Http\Resources\ServiceOrderResource;
use App\Models\LaborLevel;
use App\Models\OrderPart;
use App\Models\ServiceOrder;
use App\Services\Workshop\WorkbenchService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Banco de trabajo del técnico (T2 Equipos asignados, T3 Banco de trabajo, RF-05).
 * Solo ve y modifica las órdenes que tiene asignadas.
 */
class WorkbenchController extends Controller
{
    public function __construct(private readonly WorkbenchService $workbench) {}

    /** GET /my/orders?status=&active=1&search= */
    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', 'string', 'exists:order_statuses,code'],
            'active' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
        ]);

        return ServiceOrderResource::collection($this->workbench->myOrders($request->user(), $filters));
    }

    /** GET /my/orders/{folio} */
    public function show(Request $request, string $folio): JsonResponse
    {
        return $this->withOrder($request, $folio, fn (ServiceOrder $order) => $order);
    }

    /** POST /my/orders/{folio}/start — "Iniciar" */
    public function start(Request $request, string $folio): JsonResponse
    {
        return $this->withOrder($request, $folio, fn (ServiceOrder $order) => $this->workbench->start($order, $request->user()));
    }

    /** POST /my/orders/{folio}/pause */
    public function pause(Request $request, string $folio): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:255']], [], ['reason' => 'motivo de la pausa']);

        return $this->withOrder($request, $folio, fn (ServiceOrder $order) => $this->workbench->pause($order, $request->user(), $data['reason']));
    }

    /** POST /my/orders/{folio}/resume */
    public function resume(Request $request, string $folio): JsonResponse
    {
        return $this->withOrder($request, $folio, fn (ServiceOrder $order) => $this->workbench->resume($order, $request->user()));
    }

    /** POST /my/orders/{folio}/diagnosis */
    public function diagnosis(DiagnosisRequest $request, string $folio): JsonResponse
    {
        return $this->withOrder($request, $folio, fn (ServiceOrder $order) => $this->workbench->diagnose($order, $request->user(), $request->validated()));
    }

    /** GET /labor-levels — catálogo para el diagnóstico y la cotización */
    public function laborLevels(): JsonResponse
    {
        return response()->json([
            'data' => LaborLevel::where('is_active', true)->orderBy('sort_order')
                ->get(['id', 'name', 'typical_time', 'examples', 'price', 'is_inspection']),
        ]);
    }

    /**
     * Busca la orden del técnico (404 si no es suya), aplica la acción y
     * responde con la orden y su cronómetro.
     *
     * @param  callable(ServiceOrder): ServiceOrder  $action
     */
    private function withOrder(Request $request, string $folio, callable $action): JsonResponse
    {
        $order = $this->workbench->findMine($request->user(), $folio);

        if (! $order) {
            return response()->json(['message' => "No tienes asignada la orden {$folio}.", 'code' => 'NOT_FOUND'], 404);
        }

        $order = $action($order);

        return response()->json([
            'data' => new ServiceOrderResource($order),
            'timer' => $this->workbench->timer($order),
            // Refacciones entregadas para esta orden (RF-05)
            'parts' => OrderPart::with('product:id,sku,name')->where('service_order_id', $order->id)->get()
                ->map(fn (OrderPart $p) => [
                    'id' => $p->id,
                    'product' => $p->product?->name,
                    'sku' => $p->product?->sku,
                    'quantity' => $p->quantity,
                    'returned_quantity' => $p->returned_quantity,
                    'unit_price' => (float) $p->unit_price,
                ]),
        ]);
    }
}
