<?php

namespace App\Http\Controllers\Api\Workshop;

use App\Http\Controllers\Controller;
use App\Http\Resources\PartRequestResource;
use App\Models\OrderPart;
use App\Models\PartRequest;
use App\Models\PartReturn;
use App\Services\Workshop\PartsService;
use App\Services\Workshop\WorkbenchService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Refacciones del taller (RF-05): el técnico pide y devuelve (T5),
 * el jefe entrega, rechaza y recibe devoluciones (J5).
 */
class PartRequestController extends Controller
{
    public function __construct(
        private readonly PartsService $parts,
        private readonly WorkbenchService $workbench,
    ) {}

    // ── Técnico (permiso parts.request) ──────────────────────────────────

    /** POST /my/orders/{folio}/part-requests */
    public function store(Request $request, string $folio): JsonResponse
    {
        $data = $request->validate([
            'product_id' => ['nullable', 'integer'],
            'description' => ['required_without:product_id', 'nullable', 'string', 'max:200'],
            'quantity' => ['nullable', 'integer', 'min:1', 'max:50'],
            'urgency' => ['nullable', 'in:normal,urgent'],
            'notes' => ['nullable', 'string', 'max:255'],
        ], [], ['product_id' => 'refacción', 'description' => 'descripción de la pieza', 'quantity' => 'cantidad', 'notes' => 'notas']);

        $order = $this->workbench->findMine($request->user(), $folio);

        if (! $order) {
            return response()->json(['message' => "No tienes asignada la orden {$folio}.", 'code' => 'NOT_FOUND'], 404);
        }

        $partRequest = $this->parts->request($order, $request->user(), $data);

        return response()->json([
            'message' => "Solicitud {$partRequest->folio} enviada al jefe de técnicos.",
            'data' => new PartRequestResource($partRequest),
        ], 201);
    }

    /** GET /my/part-requests?status= — T5 mis solicitudes */
    public function mine(Request $request): AnonymousResourceCollection
    {
        $status = $request->validate(['status' => ['nullable', 'in:pending,delivered,rejected,cancelled,ordered']])['status'] ?? null;

        return PartRequestResource::collection(
            PartRequest::with(['product', 'serviceOrder', 'handledBy'])
                ->where('technician_id', $request->user()->id)
                ->when($status, fn ($q) => $q->where('status', $status))
                ->latest('id')
                ->paginate(30)
        );
    }

    /** POST /my/part-requests/{folio}/cancel */
    public function cancel(Request $request, string $folio): JsonResponse
    {
        $partRequest = $this->findRequest($folio);

        return $partRequest instanceof JsonResponse ? $partRequest : response()->json([
            'message' => 'Solicitud cancelada.',
            'data' => new PartRequestResource($this->parts->cancel($partRequest, $request->user())),
        ]);
    }

    /** GET /my/order-parts — piezas que le entregaron, para devolver lo que no usó */
    public function myParts(Request $request): JsonResponse
    {
        $parts = OrderPart::with(['product:id,sku,name', 'serviceOrder:id,folio'])
            ->where('technician_id', $request->user()->id)
            ->whereColumn('returned_quantity', '<', 'quantity')
            ->latest('id')
            ->get();

        return response()->json(['data' => $parts->map(fn (OrderPart $p) => $this->partRow($p))]);
    }

    /** POST /my/order-parts/{orderPart}/return */
    public function returnPart(Request $request, OrderPart $orderPart): JsonResponse
    {
        $data = $request->validate([
            'quantity' => ['required', 'integer', 'min:1'],
            'reason' => ['required', 'string', 'max:255'],
            'condition' => ['nullable', 'in:new,open,damaged'],
        ], [], ['quantity' => 'cantidad', 'reason' => 'motivo', 'condition' => 'estado de la pieza']);

        $return = $this->parts->returnPart($orderPart, $request->user(), $data);

        return response()->json([
            'message' => 'Devolución registrada. Entrega la pieza al jefe de técnicos.',
            'data' => $this->returnRow($return),
        ], 201);
    }

    // ── Jefe (permiso parts.handle) ──────────────────────────────────────

    /** GET /part-requests?status=pending — J5 solicitudes, urgentes primero */
    public function index(Request $request): AnonymousResourceCollection
    {
        $status = $request->validate(['status' => ['nullable', 'in:pending,delivered,rejected,cancelled,ordered']])['status'] ?? null;

        return PartRequestResource::collection(
            PartRequest::with(['product', 'serviceOrder', 'technician', 'handledBy'])
                ->when($status, fn ($q) => $q->where('status', $status))
                ->orderByRaw("urgency = 'urgent' DESC")
                ->oldest('id')
                ->paginate(30)
        );
    }

    /** POST /part-requests/{folio}/deliver — product_id solo si el técnico la describió sin catálogo */
    public function deliver(Request $request, string $folio): JsonResponse
    {
        $data = $request->validate(['product_id' => ['nullable', 'integer']], [], ['product_id' => 'refacción']);
        $partRequest = $this->findRequest($folio);

        if ($partRequest instanceof JsonResponse) {
            return $partRequest;
        }

        $partRequest = $this->parts->deliver($partRequest, $request->user(), $data['product_id'] ?? null);

        return response()->json([
            'message' => "Refacción entregada para la orden {$partRequest->serviceOrder->folio}.",
            'data' => new PartRequestResource($partRequest),
        ]);
    }

    /** POST /part-requests/{folio}/reject */
    public function reject(Request $request, string $folio): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:255']], [], ['reason' => 'motivo']);
        $partRequest = $this->findRequest($folio);

        return $partRequest instanceof JsonResponse ? $partRequest : response()->json([
            'message' => 'Solicitud rechazada.',
            'data' => new PartRequestResource($this->parts->reject($partRequest, $request->user(), $data['reason'])),
        ]);
    }

    /** GET /part-returns?status=pending — J5 devoluciones por recibir */
    public function returns(Request $request): JsonResponse
    {
        $status = $request->validate(['status' => ['nullable', 'in:pending,received,rejected']])['status'] ?? 'pending';

        $returns = PartReturn::with(['orderPart.product', 'orderPart.serviceOrder', 'technician', 'receivedBy'])
            ->where('status', $status)
            ->oldest('id')
            ->get();

        return response()->json(['data' => $returns->map(fn (PartReturn $r) => $this->returnRow($r))]);
    }

    /** POST /part-returns/{partReturn}/receive */
    public function receive(Request $request, PartReturn $partReturn): JsonResponse
    {
        $data = $request->validate([
            'condition' => ['required', 'in:new,open,damaged'],
            'returns_to_stock' => ['nullable', 'boolean'],
        ], [], ['condition' => 'estado de la pieza']);

        $return = $this->parts->receiveReturn($partReturn, $request->user(), $data);

        return response()->json([
            'message' => $return->returns_to_stock ? 'Devolución recibida; la pieza regresó al stock.' : 'Devolución recibida; la pieza no regresó al stock.',
            'data' => $this->returnRow($return),
        ]);
    }

    private function findRequest(string $folio): PartRequest|JsonResponse
    {
        return PartRequest::with('serviceOrder')->where('folio', $folio)->first()
            ?? response()->json(['message' => "No existe la solicitud {$folio}.", 'code' => 'NOT_FOUND'], 404);
    }

    /** @return array<string, mixed> */
    private function partRow(OrderPart $part): array
    {
        return [
            'id' => $part->id,
            'service_order_folio' => $part->serviceOrder?->folio,
            'product' => ['id' => $part->product_id, 'sku' => $part->product?->sku, 'name' => $part->product?->name],
            'quantity' => $part->quantity,
            'returned_quantity' => $part->returned_quantity,
            'unit_price' => (float) $part->unit_price,
            'subtotal' => (float) $part->subtotal,
            'delivered_at' => $part->created_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    private function returnRow(PartReturn $return): array
    {
        return [
            'id' => $return->id,
            'status' => $return->status,
            'quantity' => $return->quantity,
            'reason' => $return->reason,
            'condition' => $return->condition,
            'returns_to_stock' => (bool) $return->returns_to_stock,
            'product' => $return->orderPart?->product?->name,
            'service_order_folio' => $return->orderPart?->serviceOrder?->folio,
            'technician' => $return->technician?->name,
            'received_by' => $return->receivedBy?->name,
            'received_at' => $return->received_at?->toIso8601String(),
            'created_at' => $return->created_at?->toIso8601String(),
        ];
    }
}
