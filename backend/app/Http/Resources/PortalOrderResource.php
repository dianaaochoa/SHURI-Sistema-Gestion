<?php

namespace App\Http\Resources;

use App\Models\ServiceOrder;
use Illuminate\Http\Request;

/**
 * Orden de servicio para el portal del cliente (P1, P2, P3). Mismo formato que ve el
 * personal (así el front usa un solo mapeo), pero sin lo que el cliente no debe ver:
 * PIN del equipo, notas internas, cronómetro del taller, presupuestos que el jefe aún
 * no envía y nombres completos del personal (solo el nombre de pila).
 *
 * @mixin ServiceOrder
 */
class PortalOrderResource extends ServiceOrderResource
{
    /** Presupuestos que el cliente ya puede ver. */
    private const VISIBLE_QUOTES = ['pending', 'approved', 'rejected', 'expired'];

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $data = parent::toArray($request);

        unset($data['device_pin'], $data['has_device_pin'], $data['timer'], $data['labor_level_id'], $data['estimated_minutes'], $data['intake_checklist']);

        $firstName = fn (?string $name) => $name ? strtok($name, ' ') : null;
        $data['technician'] = $this->technician ? ['id' => null, 'name' => $firstName($this->technician->name)] : null;
        $data['received_by'] = $firstName($this->receivedBy?->name);
        $data['delivered_by'] = $firstName($this->deliveredBy?->name);

        // Solo lo que se le mostró al cliente: nada de notas internas
        $data['logs'] = collect($data['logs'] ?? [])
            ->where('visible_to_customer', true)
            ->map(fn (array $log) => ['user' => null] + $log)
            ->values()
            ->all();

        // El último presupuesto que el cliente ya recibió (no el borrador del jefe)
        $quote = $this->quotes->whereIn('status', self::VISIBLE_QUOTES)->sortByDesc('id')->first();
        $data['quote'] = $quote ? [
            'folio' => $quote->folio,
            'type' => $quote->type,
            'status' => $quote->status,
            'diagnosis' => $quote->diagnosis,
            'customer_note' => $quote->customer_note,
            'labor_amount' => (float) $quote->labor_amount,
            'parts_amount' => (float) $quote->parts_amount,
            'discount' => (float) $quote->discount,
            'total' => (float) $quote->total,
            'valid_until' => $quote->valid_until?->toDateString(),
            'sent_at' => $quote->sent_at?->toIso8601String(),
            'answered_at' => $quote->answered_at?->toIso8601String(),
            'created_at' => $quote->created_at?->toIso8601String(),
            'items' => $quote->quoteItems->map(fn ($i) => [
                'type' => $i->type,
                'concept' => $i->concept,
                'quantity' => $i->quantity,
                'unit_price' => (float) $i->unit_price,
            ])->all(),
        ] : null;

        // P2.11 calificación del servicio (una por folio)
        $data['rating'] = $this->rating ? [
            'stars' => (int) $this->rating,
            'tags' => $this->rating_tags ?? [],
            'comment' => $this->rating_comment,
            'rated_at' => $this->rated_at?->toIso8601String(),
        ] : null;

        return $data;
    }
}
