<?php

namespace App\Http\Resources;

use App\Models\Quote;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Presupuesto (J3 para el jefe, P2 para el cliente). El costo de cada refacción
 * solo lo ve el personal con catalog.view_costs; el cliente solo ve precios.
 *
 * @mixin Quote
 */
class QuoteResource extends JsonResource
{
    /** @var array<string, string> */
    private const STATUSES = [
        'to_quote' => 'Por cotizar',
        'returned_to_technician' => 'Regresado al técnico',
        'pending' => 'Por aprobar',
        'approved' => 'Aprobado',
        'rejected' => 'Rechazado',
        'expired' => 'Vencido',
        'cancelled' => 'Cancelado',
    ];

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $user = $request->user();
        $isStaff = $user instanceof User;
        $canSeeCosts = $isStaff && $user->hasPermission('catalog.view_costs');

        return [
            'folio' => $this->folio,
            'type' => $this->type,
            'status' => $this->status,
            'status_name' => self::STATUSES[$this->status] ?? $this->status,
            'diagnosis' => $this->diagnosis,
            'failure_cause' => $this->failure_cause,
            'labor_amount' => (float) $this->labor_amount,
            'parts_amount' => (float) $this->parts_amount,
            'discount' => (float) $this->discount,
            'total' => (float) $this->total,
            'warranty_days' => $this->warranty_days,
            'valid_until' => $this->valid_until?->toDateString(),
            'estimated_delivery_date' => $this->estimated_delivery_date?->toDateString(),
            'customer_note' => $this->customer_note,
            'customer_comment' => $this->customer_comment,
            'sent_at' => $this->sent_at?->toIso8601String(),
            'answered_at' => $this->answered_at?->toIso8601String(),
            // Datos internos del taller: solo para el personal
            'return_reason' => $this->when($isStaff, $this->return_reason),
            'estimated_minutes' => $this->when($isStaff, $this->estimated_minutes),
            // when() no filtra dentro de listas anidadas: el costo se agrega a mano solo si se puede ver
            'items' => $this->whenLoaded('quoteItems', fn () => $this->quoteItems->map(function ($item) use ($canSeeCosts) {
                $row = [
                    'type' => $item->type,
                    'concept' => $item->concept,
                    'quantity' => $item->quantity,
                    'unit_price' => (float) $item->unit_price,
                    'subtotal' => round((float) $item->unit_price * $item->quantity, 2),
                    'out_of_stock' => (bool) $item->out_of_stock,
                ];

                if ($canSeeCosts) {
                    $row['unit_cost'] = $item->unit_cost !== null ? (float) $item->unit_cost : null;
                }

                return $row;
            })->all()),
        ];
    }
}
