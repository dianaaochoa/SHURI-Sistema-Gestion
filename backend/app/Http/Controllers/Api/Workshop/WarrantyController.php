<?php

namespace App\Http\Controllers\Api\Workshop;

use App\Http\Controllers\Controller;
use App\Http\Resources\WarrantyResource;
use App\Models\ServiceOrder;
use App\Models\Warranty;
use App\Services\Workshop\WarrantyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Garantías del lado del personal (RF-11): mostrador (C4), jefe (J4) y técnico (T4).
 */
class WarrantyController extends Controller
{
    private const WITH = ['serviceOrder.device', 'technician'];

    public function __construct(private readonly WarrantyService $warranties) {}

    /** GET /warranties?status= */
    public function index(Request $request): AnonymousResourceCollection
    {
        $status = $request->validate(['status' => ['nullable', 'string', 'max:20']])['status'] ?? null;

        return WarrantyResource::collection(
            Warranty::with(self::WITH)->when($status, fn ($q) => $q->where('status', $status))->latest('id')->paginate(30)
        );
    }

    /** GET /warranties/{folio} */
    public function show(string $folio): JsonResponse
    {
        $warranty = $this->find($folio);

        return $warranty instanceof JsonResponse ? $warranty : response()->json(['data' => new WarrantyResource($warranty)]);
    }

    /** POST /service-orders/{folio}/warranties — C4 la cajera registra la garantía en mostrador */
    public function storeAtCounter(Request $request, string $folio): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:2000']], [], ['reason' => 'falla que reporta el cliente']);
        $order = ServiceOrder::where('folio', $folio)->first();

        if (! $order) {
            return response()->json(['message' => "No existe la orden {$folio}.", 'code' => 'NOT_FOUND'], 404);
        }

        $warranty = $this->warranties->request($order, $data['reason'], cashier: $request->user());

        return response()->json([
            'message' => "Garantía {$warranty->folio} registrada; el equipo quedó recibido.",
            'data' => new WarrantyResource($warranty->load(self::WITH)),
        ], 201);
    }

    /** POST /warranties/{folio}/receive — el cliente trae el equipo de una garantía pedida en el portal */
    public function receive(Request $request, string $folio): JsonResponse
    {
        return $this->act($folio, fn (Warranty $w) => $this->warranties->receive($w, $request->user()), 'Equipo recibido para revisar la garantía.');
    }

    /** POST /warranties/{folio}/assign — J4 mandar a revisión */
    public function assign(Request $request, string $folio): JsonResponse
    {
        $data = $request->validate(['technician_id' => ['required', 'integer']], [], ['technician_id' => 'técnico']);

        return $this->act($folio, fn (Warranty $w) => $this->warranties->assign($w, $request->user(), $data['technician_id']), 'Garantía enviada a revisión.');
    }

    /** POST /warranties/{folio}/rule — J4 dictamen */
    public function rule(Request $request, string $folio): JsonResponse
    {
        $data = $request->validate([
            'ruling' => ['required', 'in:covered,not_covered,covered_with_cost'],
            'reason' => ['required', 'string', 'max:255'],
            'extra_cost' => ['required_if:ruling,covered_with_cost', 'nullable', 'numeric', 'min:0', 'max:999999.99'],
        ], [], ['ruling' => 'dictamen', 'reason' => 'motivo del dictamen', 'extra_cost' => 'costo extra']);

        return $this->act($folio, fn (Warranty $w) => $this->warranties->rule(
            $w, $request->user(), $data['ruling'], $data['reason'], (float) ($data['extra_cost'] ?? 0)
        ), 'Dictamen guardado. Se avisó al cliente.');
    }

    /** POST /warranties/{folio}/deliver — entrega sin costo (con costo se cobra en el POS) */
    public function deliver(Request $request, string $folio): JsonResponse
    {
        return $this->act($folio, fn (Warranty $w) => $this->warranties->deliver($w, $request->user()), 'Equipo entregado.');
    }

    /** GET /my/warranties — T4 garantías asignadas al técnico */
    public function mine(Request $request): AnonymousResourceCollection
    {
        return WarrantyResource::collection(
            Warranty::with(self::WITH)->where('technician_id', $request->user()->id)
                ->whereIn('status', ['in_review', 'in_repair', 'awaiting_ruling', 'approved'])
                ->latest('id')->get()
        );
    }

    /** POST /my/warranties/{folio}/review — T4 reporte de la revisión */
    public function review(Request $request, string $folio): JsonResponse
    {
        $data = $request->validate(['report' => ['required', 'string', 'max:2000']], [], ['report' => 'reporte de la revisión']);

        return $this->act($folio, fn (Warranty $w) => $this->warranties->review($w, $request->user(), $data['report']), 'Revisión enviada al jefe para dictaminar.');
    }

    /** POST /my/warranties/{folio}/finish — reparación de la garantía terminada */
    public function finish(Request $request, string $folio): JsonResponse
    {
        return $this->act($folio, fn (Warranty $w) => $this->warranties->finish($w, $request->user()), 'Garantía terminada. Se avisó al cliente.');
    }

    /** @param  callable(Warranty): Warranty  $action */
    private function act(string $folio, callable $action, string $message): JsonResponse
    {
        $warranty = $this->find($folio);

        if ($warranty instanceof JsonResponse) {
            return $warranty;
        }

        return response()->json([
            'message' => $message,
            'data' => new WarrantyResource($action($warranty)->load(self::WITH)),
        ]);
    }

    private function find(string $folio): Warranty|JsonResponse
    {
        return Warranty::with(self::WITH)->where('folio', $folio)->first()
            ?? response()->json(['message' => "No existe la garantía {$folio}.", 'code' => 'NOT_FOUND'], 404);
    }
}
