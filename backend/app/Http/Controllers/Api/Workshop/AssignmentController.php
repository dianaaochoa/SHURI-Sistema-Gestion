<?php

namespace App\Http\Controllers\Api\Workshop;

use App\Http\Controllers\Controller;
use App\Http\Requests\Workshop\AssignOrderRequest;
use App\Http\Resources\ServiceOrderResource;
use App\Repositories\Contracts\OrderRepositoryInterface;
use App\Services\Workshop\AssignmentService;
use Illuminate\Http\JsonResponse;

/**
 * Jefe de técnicos: tablero de órdenes (J1/J2), técnicos con su carga de trabajo (J7)
 * y asignación (RF-04).
 */
class AssignmentController extends Controller
{
    public function __construct(
        private readonly AssignmentService $assignments,
        private readonly OrderRepositoryInterface $orders,
    ) {}

    /** GET /workshop/board */
    public function board(): JsonResponse
    {
        return response()->json(['data' => $this->assignments->board()]);
    }

    /** GET /technicians — el menos ocupado primero */
    public function technicians(): JsonResponse
    {
        return response()->json(['data' => $this->assignments->technicians()]);
    }

    /** POST /service-orders/{folio}/assign */
    public function assign(AssignOrderRequest $request, string $folio): JsonResponse
    {
        $order = $this->orders->findByFolio($folio);

        if (! $order) {
            return response()->json(['message' => "No existe la orden {$folio}.", 'code' => 'NOT_FOUND'], 404);
        }

        $order = $this->assignments->assign(
            $order,
            (int) $request->validated('technician_id'),
            $request->user(),
            $request->validated('priority'),
        );

        return response()->json([
            'message' => "Orden {$order->folio} asignada a {$order->technician->name}.",
            'data' => new ServiceOrderResource($order),
        ]);
    }
}
