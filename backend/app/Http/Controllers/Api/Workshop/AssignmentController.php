<?php

namespace App\Http\Controllers\Api\Workshop;

use App\Http\Controllers\Controller;
use App\Http\Requests\Workshop\AssignOrderRequest;
use App\Http\Resources\ServiceOrderResource;
use App\Repositories\Contracts\OrderRepositoryInterface;
use App\Services\Workshop\AssignmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
            $request->validated('promised_date'),
            $request->validated('notes'),
        );

        return response()->json([
            'message' => "Orden {$order->folio} asignada a {$order->technician->name}.",
            'data' => new ServiceOrderResource($this->orders->findByFolio($folio)),
        ]);
    }

    /** POST /service-orders/{folio}/priority — J2.3 cambiar la prioridad */
    public function priority(Request $request, string $folio): JsonResponse
    {
        $data = $request->validate(['priority' => ['required', 'in:low,normal,high,urgent']], [], ['priority' => 'prioridad']);
        $order = $this->orders->findByFolio($folio);

        if (! $order) {
            return response()->json(['message' => "No existe la orden {$folio}.", 'code' => 'NOT_FOUND'], 404);
        }

        $this->assignments->changePriority($order, $data['priority'], $request->user());

        return response()->json(['message' => 'Prioridad actualizada.', 'data' => new ServiceOrderResource($this->orders->findByFolio($folio))]);
    }

    /**
     * POST /service-orders/{folio}/notes — nota interna en la bitácora (J2.3 jefe, T3 técnico).
     * Un técnico solo puede anotar en sus propias órdenes.
     */
    public function note(Request $request, string $folio): JsonResponse
    {
        $data = $request->validate(['note' => ['required', 'string', 'max:500']], [], ['note' => 'nota']);
        $order = $this->orders->findByFolio($folio);
        $user = $request->user();

        if (! $order || (! $user->hasPermission('orders.assign') && $order->technician_id !== $user->id)) {
            return response()->json(['message' => "No existe la orden {$folio}.", 'code' => 'NOT_FOUND'], 404);
        }

        $this->assignments->note($order, $user, $data['note']);

        return response()->json(['message' => 'Nota agregada.', 'data' => new ServiceOrderResource($this->orders->findByFolio($folio))], 201);
    }
}
