<?php

namespace App\Services\Cash;

use App\Models\CashMovement;
use App\Models\CashRegister;
use App\Models\CashShift;
use App\Models\User;
use App\Notifications\CashDifferenceNotification;
use App\Services\AuditService;
use App\Services\FolioService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\QueryException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;

/**
 * Turnos de caja (RF-13, T-09): apertura, retiros e ingresos de efectivo,
 * corte con diferencia y revisión del administrador.
 * El efectivo esperado lo calcula la vista v_shift_cash_summary.
 */
class CashShiftService
{
    public function __construct(
        private readonly FolioService $folios,
        private readonly AuditService $audit,
    ) {}

    /** Turno abierto del usuario (null si no tiene). */
    public function current(User $user): ?CashShift
    {
        return CashShift::with(['cashRegister', 'user'])
            ->where('user_id', $user->id)
            ->where('status', 'open')
            ->first();
    }

    /** @param  array{cash_register_id?: int|null, shift?: string|null, opening_amount?: float|null}  $data */
    public function open(User $user, array $data): CashShift
    {
        $registerId = $data['cash_register_id'] ?? $user->cash_register_id;
        $register = $registerId ? CashRegister::where('is_active', true)->find($registerId) : null;

        if (! $register) {
            throw ValidationException::withMessages(['cash_register_id' => 'Elige una caja activa para abrir el turno.']);
        }

        if ($this->current($user)) {
            throw ValidationException::withMessages(['cash_register_id' => 'Ya tienes un turno abierto. Ciérralo antes de abrir otro.']);
        }

        $taken = CashShift::with('user:id,name')->where('cash_register_id', $register->id)->where('status', 'open')->first();
        if ($taken) {
            throw ValidationException::withMessages([
                'cash_register_id' => "La {$register->name} ya tiene un turno abierto por {$taken->user->name}.",
            ]);
        }

        try {
            $shift = CashShift::create([
                'cash_register_id' => $register->id,
                'user_id' => $user->id,
                'shift' => $data['shift'] ?? $user->shift ?? 'morning',
                'opened_at' => now(),
                'opening_amount' => $data['opening_amount'] ?? $register->default_opening_amount,
                'status' => 'open',
            ]);
        } catch (QueryException $e) {
            // Dos cajeras abriendo la misma caja al mismo tiempo: lo frena el UNIQUE open_cash_register_id
            throw ValidationException::withMessages(['cash_register_id' => "La {$register->name} ya tiene un turno abierto."]);
        }

        $this->audit->log('cash', 'shift_opened', "Apertura de turno en {$register->name} con \${$shift->opening_amount}", $user->id, 'cash_shifts', $shift->id);

        return $shift->load(['cashRegister', 'user']);
    }

    /**
     * Retiro (cash_out) o ingreso (cash_in) de efectivo durante el turno (C10.2).
     *
     * @param  array{type: string, amount: float, reason: string}  $data
     */
    public function movement(CashShift $shift, User $user, array $data): CashMovement
    {
        $this->ensureCanOperate($shift, $user);

        return DB::transaction(function () use ($shift, $user, $data) {
            // Bloquea el turno para que dos retiros simultáneos no pasen el efectivo disponible
            CashShift::whereKey($shift->id)->lockForUpdate()->first();

            $before = $this->summary($shift)['expected_cash'];
            $amount = round((float) $data['amount'], 2);

            if ($data['type'] === 'cash_out' && $amount > $before) {
                throw ValidationException::withMessages([
                    'amount' => 'No puedes retirar $'.number_format($amount, 2).': en caja hay $'.number_format($before, 2).'.',
                ]);
            }

            $after = $data['type'] === 'cash_out' ? $before - $amount : $before + $amount;

            $movement = CashMovement::create([
                'folio' => $data['type'] === 'cash_out' ? $this->folios->next('cash_withdrawal') : null,
                'cash_shift_id' => $shift->id,
                'user_id' => $user->id,
                'type' => $data['type'],
                'amount' => $amount,
                'reason' => $data['reason'],
                'cash_before' => $before,
                'cash_after' => $after,
            ]);

            $this->audit->log('cash', $data['type'], ($data['type'] === 'cash_out' ? 'Retiro' : 'Ingreso')." de \${$amount}: {$data['reason']}", $user->id, 'cash_movements', $movement->id);

            return $movement;
        });
    }

    /**
     * Corte del turno (C10.4): compara el efectivo contado contra el esperado.
     * Si hay diferencia, avisa a quien revisa los cortes (RF-13).
     *
     * @param  array{counted_cash: float, cash_left?: float|null, closing_notes?: string|null}  $data
     */
    public function close(CashShift $shift, User $user, array $data): CashShift
    {
        $this->ensureCanOperate($shift, $user);

        DB::transaction(function () use ($shift, $user, $data) {
            CashShift::whereKey($shift->id)->lockForUpdate()->first();

            $summary = $this->summary($shift);
            $counted = round((float) $data['counted_cash'], 2);
            $left = round((float) ($data['cash_left'] ?? 0), 2);

            if ($left > $counted) {
                throw ValidationException::withMessages(['cash_left' => 'El fondo que se queda en caja no puede ser mayor a lo contado.']);
            }

            $shift->forceFill([
                'folio' => $this->folios->next('cash_closing'),
                'closed_at' => now(),
                'closed_by' => $user->id,
                'expected_cash' => $summary['expected_cash'],
                'counted_cash' => $counted,
                'card_total' => $summary['card_sales'],
                'transfer_total' => $summary['transfer_sales'],
                'cash_left' => $left,
                'cash_handed_over' => $counted - $left,
                'closing_notes' => $data['closing_notes'] ?? null,
                'status' => 'closed',
            ])->save();
        });

        $shift->refresh();
        $difference = (float) $shift->difference;

        $this->audit->log('cash', 'shift_closed', "Corte {$shift->folio}: esperado \${$shift->expected_cash}, contado \${$shift->counted_cash}, diferencia \${$difference}", $user->id, 'cash_shifts', $shift->id);

        if (abs($difference) >= 0.01) {
            Notification::send($this->reviewers(), new CashDifferenceNotification($shift->load(['cashRegister', 'user'])));
        }

        return $shift->load(['cashRegister', 'user', 'closedBy']);
    }

    /** AD3: el administrador revisa el corte (sobre todo los que tienen diferencia). */
    public function review(CashShift $shift, User $admin, ?string $comment): CashShift
    {
        if ($shift->status !== 'closed') {
            throw ValidationException::withMessages(['status' => $shift->status === 'open'
                ? 'El turno sigue abierto; primero se hace el corte.'
                : 'Este corte ya fue revisado.']);
        }

        $shift->forceFill([
            'status' => 'reviewed',
            'reviewed_by' => $admin->id,
            'reviewed_at' => now(),
            'review_comment' => $comment,
        ])->save();

        $this->audit->log('cash', 'shift_reviewed', "Corte {$shift->folio} revisado".($comment ? ": {$comment}" : ''), $admin->id, 'cash_shifts', $shift->id);

        return $shift->load(['cashRegister', 'user', 'closedBy', 'reviewedBy']);
    }

    /**
     * Resumen del turno desde la vista v_shift_cash_summary.
     *
     * @return array<string, float>
     */
    public function summary(CashShift $shift): array
    {
        $row = DB::table('v_shift_cash_summary')->where('cash_shift_id', $shift->id)->first();

        return [
            'opening_amount' => (float) $row->opening_amount,
            'cash_sales' => (float) $row->cash_sales,
            'card_sales' => (float) $row->card_sales,
            'transfer_sales' => (float) $row->transfer_sales,
            'cash_in' => (float) $row->cash_in,
            'cash_out' => (float) $row->cash_out,
            'cash_refunds' => (float) $row->cash_refunds,
            'cash_supplier_payments' => (float) $row->cash_supplier_payments,
            'expected_cash' => round((float) $row->expected_cash, 2),
        ];
    }

    /** Solo la dueña del turno lo opera; el administrador puede cerrar un turno olvidado. */
    private function ensureCanOperate(CashShift $shift, User $user): void
    {
        if ($shift->status !== 'open') {
            throw ValidationException::withMessages(['status' => 'El turno ya está cerrado.']);
        }

        if ($shift->user_id !== $user->id && ! $user->hasPermission('cash.review_closing')) {
            throw new HttpResponseException(response()->json([
                'message' => 'Este turno es de otra persona.',
                'code' => 'FORBIDDEN',
            ], 403));
        }
    }

    /** @return Collection<int, User> */
    private function reviewers()
    {
        return User::query()
            ->where('is_active', true)
            ->whereHas('role.permissions', fn ($q) => $q->where('code', 'cash.review_closing'))
            ->get();
    }
}
