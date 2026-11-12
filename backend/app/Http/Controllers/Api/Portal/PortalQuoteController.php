<?php

namespace App\Http\Controllers\Api\Portal;

use App\Http\Controllers\Controller;
use App\Http\Resources\QuoteResource;
use App\Models\Quote;
use App\Services\Workshop\QuoteService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Presupuesto en el portal del cliente (P2): verlo y aprobarlo o rechazarlo (RF-07).
 */
class PortalQuoteController extends Controller
{
    public function __construct(private readonly QuoteService $quotes) {}

    /** GET /portal/orders/{folio}/quote — el presupuesto por aprobar (o el último respondido) */
    public function show(Request $request, string $folio): JsonResponse
    {
        $quote = Quote::with('quoteItems')
            ->whereIn('status', ['pending', 'approved', 'rejected', 'expired'])
            ->whereHas('serviceOrder', fn ($q) => $q->where('folio', $folio)->where('customer_id', $request->user()->id))
            ->orderByRaw("status = 'pending' DESC")
            ->latest('id')
            ->first();

        return $quote
            ? response()->json(['data' => new QuoteResource($quote)])
            : response()->json(['message' => 'Este equipo no tiene presupuesto todavía.', 'code' => 'NOT_FOUND'], 404);
    }

    /** POST /portal/quotes/{folio}/approve */
    public function approve(Request $request, string $folio): JsonResponse
    {
        return $this->respond($request, $folio, true);
    }

    /** POST /portal/quotes/{folio}/reject */
    public function reject(Request $request, string $folio): JsonResponse
    {
        return $this->respond($request, $folio, false);
    }

    private function respond(Request $request, string $folio, bool $approved): JsonResponse
    {
        $data = $request->validate(['comment' => ['nullable', 'string', 'max:255']], [], ['comment' => 'comentario']);
        $customer = $request->user();

        // Solo presupuestos de órdenes del propio cliente (404 si es de otra persona)
        $quote = Quote::where('folio', $folio)
            ->whereHas('serviceOrder', fn ($q) => $q->where('customer_id', $customer->id))
            ->first();

        if (! $quote) {
            return response()->json(['message' => "No encontramos el presupuesto {$folio} en tu cuenta.", 'code' => 'NOT_FOUND'], 404);
        }

        $quote = $this->quotes->respond($quote, $customer, $approved, $data['comment'] ?? null, $request->ip());

        return response()->json([
            'message' => $approved
                ? '¡Gracias! Aprobaste el presupuesto; comenzaremos la reparación.'
                : 'Rechazaste el presupuesto. Tu equipo estará listo para recogerse sin reparación.',
            'data' => new QuoteResource($quote),
        ]);
    }
}
