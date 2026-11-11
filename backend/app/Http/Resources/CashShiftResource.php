<?php

namespace App\Http\Resources;

use App\Models\CashShift;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Turno de caja (C1, C10, AD3). El resumen en vivo se agrega desde el controlador.
 *
 * @mixin CashShift
 */
class CashShiftResource extends JsonResource
{
    /** @var array<string, string> */
    private const SHIFTS = ['morning' => 'Matutino', 'evening' => 'Vespertino', 'full_day' => 'Completo'];

    /** @var array<string, string> */
    private const STATUSES = ['open' => 'Abierto', 'closed' => 'Cerrado', 'reviewed' => 'Revisado'];

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'folio' => $this->folio,
            'status' => $this->status,
            'status_name' => self::STATUSES[$this->status] ?? $this->status,
            'shift' => $this->shift,
            'shift_name' => self::SHIFTS[$this->shift] ?? $this->shift,
            'cash_register' => $this->whenLoaded('cashRegister', fn () => ['id' => $this->cashRegister->id, 'name' => $this->cashRegister->name]),
            'cashier' => $this->whenLoaded('user', fn () => ['id' => $this->user->id, 'name' => $this->user->name]),
            'opened_at' => $this->opened_at?->toIso8601String(),
            'opening_amount' => (float) $this->opening_amount,
            'closed_at' => $this->closed_at?->toIso8601String(),
            'expected_cash' => $this->expected_cash !== null ? (float) $this->expected_cash : null,
            'counted_cash' => $this->counted_cash !== null ? (float) $this->counted_cash : null,
            'difference' => $this->difference !== null ? (float) $this->difference : null,
            'card_total' => $this->card_total !== null ? (float) $this->card_total : null,
            'transfer_total' => $this->transfer_total !== null ? (float) $this->transfer_total : null,
            'cash_left' => $this->cash_left !== null ? (float) $this->cash_left : null,
            'cash_handed_over' => $this->cash_handed_over !== null ? (float) $this->cash_handed_over : null,
            'closing_notes' => $this->closing_notes,
            'reviewed_by' => $this->whenLoaded('reviewedBy', fn () => $this->reviewedBy?->name),
            'reviewed_at' => $this->reviewed_at?->toIso8601String(),
            'review_comment' => $this->review_comment,
            'movements' => $this->whenLoaded('cashMovements', fn () => $this->cashMovements->map(fn ($m) => [
                'id' => $m->id,
                'folio' => $m->folio,
                'type' => $m->type,
                'type_name' => $m->type === 'cash_out' ? 'Retiro' : 'Ingreso',
                'amount' => (float) $m->amount,
                'reason' => $m->reason,
                'cash_before' => (float) $m->cash_before,
                'cash_after' => (float) $m->cash_after,
                'created_at' => $m->created_at?->toIso8601String(),
            ])),
        ];
    }
}
