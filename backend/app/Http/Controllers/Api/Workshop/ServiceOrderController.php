<?php

namespace App\Http\Controllers\Api\Workshop;

use App\Http\Controllers\Controller;
use App\Http\Requests\Workshop\StoreServiceOrderRequest;
use App\Http\Resources\ServiceOrderResource;
use App\Models\OrderStatus;
use App\Repositories\Contracts\OrderRepositoryInterface;
use App\Services\Workshop\ServiceOrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Service orders at the counter: C4 list, C5 new order, order detail.
 */
class ServiceOrderController extends Controller
{
    public function __construct(
        private readonly OrderRepositoryInterface $orders,
        private readonly ServiceOrderService $service,
    ) {}

    /** GET /service-orders?search=&status=&unassigned=1&active=1&per_page= */
    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', 'string', 'exists:order_statuses,code'],
            'technician_id' => ['nullable', 'integer'],
            'unassigned' => ['nullable', 'boolean'],
            'active' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
        ]);

        return ServiceOrderResource::collection(
            $this->orders->paginate($filters, (int) ($filters['per_page'] ?? 20))
        );
    }

    /** POST /service-orders — C5 receive a device */
    public function store(StoreServiceOrderRequest $request): JsonResponse
    {
        $result = $this->service->receive($request->validated(), $request->user());

        return response()->json([
            'message' => "Orden {$result['order']->folio} registrada.",
            'data' => new ServiceOrderResource($result['order']),
            // Only returned once, for the printed reception sheet (RF-06)
            'portal_access' => $result['portal_access'] ? [
                'email' => $result['portal_access']['email'],
                'temporary_password' => $result['portal_access']['temporary_password'],
                'expires_at' => $result['portal_access']['expires_at']->toIso8601String(),
            ] : null,
            'email_sent' => $result['email_sent'],
        ], 201);
    }

    /** GET /service-orders/{folio} */
    public function show(string $folio): ServiceOrderResource|JsonResponse
    {
        $order = $this->orders->findByFolio($folio);

        if (! $order) {
            return response()->json(['message' => "No existe la orden {$folio}.", 'code' => 'NOT_FOUND'], 404);
        }

        return new ServiceOrderResource($order);
    }

    /** GET /order-statuses — catalog with colors for badges */
    public function statuses(): JsonResponse
    {
        return response()->json([
            'data' => OrderStatus::orderBy('sort_order')->get()->map(fn (OrderStatus $s) => [
                'code' => $s->code,
                'name' => $s->name,
                'color' => $s->color_hex,
                'portal_step' => $s->portal_step,
                'is_final' => $s->is_final,
            ]),
        ]);
    }
}
