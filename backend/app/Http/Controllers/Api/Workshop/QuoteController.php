<?php

namespace App\Http\Controllers\Api\Workshop;

use App\Http\Controllers\Controller;
use App\Http\Requests\Workshop\SendQuoteRequest;
use App\Http\Resources\QuoteResource;
use App\Http\Resources\ServiceOrderResource;
use App\Models\Quote;
use App\Repositories\Contracts\OrderRepositoryInterface;
use App\Services\Workshop\QuoteService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Cotización del jefe de técnicos (J3 Por cotizar, RF-10) y liberación
 * de equipos terminados (J8).
 */
class QuoteController extends Controller
{
    public function __construct(
        private readonly QuoteService $quotes,
        private readonly OrderRepositoryInterface $orders,
    ) {}

    /** GET /quotes/to-quote — bandeja del jefe, urgentes primero */
    public function toQuote(): JsonResponse
    {
        return response()->json(['data' => $this->quotes->toQuote()]);
    }

    /** GET /quotes/{folio} */
    public function show(string $folio): JsonResponse
    {
        $quote = Quote::with('quoteItems')->where('folio', $folio)->first();

        return $quote
            ? response()->json(['data' => new QuoteResource($quote)])
            : response()->json(['message' => "No existe el presupuesto {$folio}.", 'code' => 'NOT_FOUND'], 404);
    }

    /** POST /quotes/{folio}/send — cotizar y enviar al cliente */
    public function send(SendQuoteRequest $request, string $folio): JsonResponse
    {
        $quote = Quote::where('folio', $folio)->first();

        if (! $quote) {
            return response()->json(['message' => "No existe el presupuesto {$folio}.", 'code' => 'NOT_FOUND'], 404);
        }

        $quote = $this->quotes->send($quote, $request->user(), $request->validated());

        return response()->json([
            'message' => "Presupuesto {$quote->folio} enviado al cliente.",
            'data' => new QuoteResource($quote),
        ]);
    }

    /** POST /quotes/{folio}/return — regresar al técnico con motivo */
    public function returnToTechnician(Request $request, string $folio): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:255']], [], ['reason' => 'motivo']);
        $quote = Quote::where('folio', $folio)->first();

        if (! $quote) {
            return response()->json(['message' => "No existe el presupuesto {$folio}.", 'code' => 'NOT_FOUND'], 404);
        }

        return response()->json([
            'message' => 'Presupuesto regresado al técnico.',
            'data' => new QuoteResource($this->quotes->returnToTechnician($quote, $request->user(), $data['reason'])),
        ]);
    }

    /**
     * POST /service-orders/{folio}/quote-response — C4: la cajera registra la respuesta que el
     * cliente dio en mostrador o por teléfono al presupuesto pendiente de la orden.
     */
    public function counterResponse(Request $request, string $folio): JsonResponse
    {
        $data = $request->validate([
            'approved' => ['required', 'boolean'],
            'channel' => ['required', 'in:counter,phone'],
            'comment' => ['nullable', 'string', 'max:255'],
        ], [], ['approved' => 'respuesta', 'channel' => 'medio', 'comment' => 'comentario']);

        $order = $this->orders->findByFolio($folio);

        if (! $order) {
            return response()->json(['message' => "No existe la orden {$folio}.", 'code' => 'NOT_FOUND'], 404);
        }

        $quote = $order->quotes->where('status', 'pending')->sortByDesc('id')->first();

        if (! $quote) {
            return response()->json(['message' => "La orden {$folio} no tiene un presupuesto esperando respuesta.", 'code' => 'NO_PENDING_QUOTE'], 422);
        }

        $approved = (bool) $data['approved'];
        $this->quotes->respond($quote, $order->customer, $approved, $data['comment'] ?? null, $request->ip(), $data['channel'], $request->user());

        return response()->json([
            'message' => $approved
                ? "Presupuesto {$quote->folio} aprobado; el técnico puede comenzar la reparación."
                : "Presupuesto {$quote->folio} rechazado; el equipo se entregará sin reparación.",
            'data' => new ServiceOrderResource($this->orders->findByFolio($folio)),
        ]);
    }

    /** POST /service-orders/{folio}/confirm-no-repair — J3.3 confirmar sin reparación y si se cobra la revisión */
    public function confirmNoRepair(Request $request, string $folio): JsonResponse
    {
        $data = $request->validate([
            'charge_inspection' => ['required', 'boolean'],
            'message' => ['nullable', 'string', 'max:1000'],
        ], [], ['charge_inspection' => 'cobro de revisión', 'message' => 'mensaje para el cliente']);

        $order = $this->orders->findByFolio($folio);

        if (! $order) {
            return response()->json(['message' => "No existe la orden {$folio}.", 'code' => 'NOT_FOUND'], 404);
        }

        $this->quotes->confirmNoRepair($order, $request->user(), (bool) $data['charge_inspection'], $data['message'] ?? null);

        return response()->json([
            'message' => "Orden {$folio} confirmada sin reparación. Se avisó al cliente.",
            'data' => new ServiceOrderResource($this->orders->findByFolio($folio)),
        ]);
    }

    /** POST /service-orders/{folio}/return-to-technician — J3.2 / J3.3 regresar con una pregunta */
    public function returnOrder(Request $request, string $folio): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:255']], [], ['reason' => 'motivo']);
        $order = $this->orders->findByFolio($folio);

        if (! $order) {
            return response()->json(['message' => "No existe la orden {$folio}.", 'code' => 'NOT_FOUND'], 404);
        }

        $this->quotes->returnOrderToTechnician($order, $request->user(), $data['reason']);

        return response()->json([
            'message' => 'Orden regresada al técnico.',
            'data' => new ServiceOrderResource($this->orders->findByFolio($folio)),
        ]);
    }

    /** POST /service-orders/{folio}/release — J8 equipo terminado → Listo para recoger */
    public function release(Request $request, string $folio): JsonResponse
    {
        $order = $this->orders->findByFolio($folio);

        if (! $order) {
            return response()->json(['message' => "No existe la orden {$folio}.", 'code' => 'NOT_FOUND'], 404);
        }

        $order = $this->quotes->release($order, $request->user());

        return response()->json([
            'message' => "Orden {$order->folio} lista para recoger. Se avisó al cliente.",
            'data' => new ServiceOrderResource($order),
        ]);
    }
}
