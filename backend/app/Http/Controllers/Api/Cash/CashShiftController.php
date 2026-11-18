<?php

namespace App\Http\Controllers\Api\Cash;

use App\Http\Controllers\Controller;
use App\Http\Resources\CashShiftResource;
use App\Models\CashRegister;
use App\Models\CashShift;
use App\Services\Cash\CashShiftService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Caja: apertura de turno (C1), turno actual, retiros e ingresos, corte (C10)
 * y revisión de cortes del administrador (AD3). RF-13.
 */
class CashShiftController extends Controller
{
    public function __construct(private readonly CashShiftService $cash) {}

    /** GET /cash-registers — cajas activas para elegir al abrir turno */
    public function registers(): JsonResponse
    {
        return response()->json([
            'data' => CashRegister::where('is_active', true)->orderBy('name')
                ->get(['id', 'name', 'location', 'default_opening_amount', 'shifts']),
        ]);
    }

    /** GET /cash-shifts/current — mi turno abierto con su resumen en vivo (o null) */
    public function current(Request $request): JsonResponse
    {
        $shift = $this->cash->current($request->user());

        return $shift ? $this->respond($shift) : response()->json(['data' => null, 'summary' => null]);
    }

    /** POST /cash-shifts — C1 abrir turno */
    public function open(Request $request): JsonResponse
    {
        $data = $request->validate([
            'cash_register_id' => ['nullable', 'integer'],
            'shift' => ['nullable', 'in:morning,evening,full_day'],
            'opening_amount' => ['nullable', 'numeric', 'min:0', 'max:999999.99'],
        ], [], ['cash_register_id' => 'caja', 'shift' => 'turno', 'opening_amount' => 'fondo inicial']);

        return $this->respond($this->cash->open($request->user(), $data), 'Turno abierto.', 201);
    }

    /** POST /cash-shifts/{shift}/movements — C10.2 retiro o ingreso de efectivo */
    public function movement(Request $request, CashShift $shift): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'in:cash_out,cash_in'],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:999999.99'],
            'reason' => ['required', 'string', 'max:255'],
        ], [], ['type' => 'tipo de movimiento', 'amount' => 'monto', 'reason' => 'motivo']);

        $movement = $this->cash->movement($shift, $request->user(), $data);

        return $this->respond($shift->fresh(), $movement->type === 'cash_out'
            ? "Retiro {$movement->folio} registrado."
            : 'Ingreso de efectivo registrado.', 201);
    }

    /** POST /cash-shifts/{shift}/close — C10.4 corte de caja */
    public function close(Request $request, CashShift $shift): JsonResponse
    {
        $data = $request->validate([
            'counted_cash' => ['required', 'numeric', 'min:0', 'max:999999.99'],
            'cash_left' => ['nullable', 'numeric', 'min:0', 'max:999999.99'],
            'closing_notes' => ['nullable', 'string', 'max:255'],
        ], [], ['counted_cash' => 'efectivo contado', 'cash_left' => 'fondo que se queda', 'closing_notes' => 'notas']);

        $shift = $this->cash->close($shift, $request->user(), $data);
        $difference = (float) $shift->difference;

        $message = abs($difference) < 0.01
            ? "Corte {$shift->folio} cuadrado."
            : "Corte {$shift->folio} con ".($difference < 0 ? 'faltante' : 'sobrante').' de $'.number_format(abs($difference), 2).'. Se avisó al administrador.';

        return $this->respond($shift, $message);
    }

    /** POST /cash-shifts/{shift}/review — AD3 el administrador revisa el corte */
    public function review(Request $request, CashShift $shift): JsonResponse
    {
        $data = $request->validate(['comment' => ['nullable', 'string', 'max:255']], [], ['comment' => 'comentario']);

        return $this->respond($this->cash->review($shift, $request->user(), $data['comment'] ?? null), 'Corte revisado.');
    }

    /** GET /cash-shifts?status=&user_id= — la cajera ve los suyos; el administrador todos */
    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'status' => ['nullable', 'in:open,closed,reviewed'],
            'user_id' => ['nullable', 'integer'],
            'with_difference' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
        ]);

        $user = $request->user();
        $seesAll = $user->hasPermission('cash.review_closing');

        $shifts = CashShift::with(['cashRegister', 'user'])
            ->when(! $seesAll, fn ($q) => $q->where('user_id', $user->id))
            ->when($seesAll && ($filters['user_id'] ?? null), fn ($q) => $q->where('user_id', $filters['user_id']))
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->when($filters['with_difference'] ?? false, fn ($q) => $q->where('difference', '<>', 0))
            ->orderByDesc('opened_at')
            ->paginate((int) ($filters['per_page'] ?? 20));

        return CashShiftResource::collection($shifts);
    }

    /** GET /cash-shifts/{shift} — detalle con movimientos y resumen */
    public function show(Request $request, CashShift $shift): JsonResponse
    {
        $user = $request->user();

        if ($shift->user_id !== $user->id && ! $user->hasPermission('cash.review_closing')) {
            return response()->json(['message' => 'Este turno es de otra persona.', 'code' => 'FORBIDDEN'], 403);
        }

        return $this->respond($shift);
    }

    private function respond(CashShift $shift, ?string $message = null, int $status = 200): JsonResponse
    {
        $shift->loadMissing(['cashRegister', 'user', 'cashMovements', 'reviewedBy']);

        return response()->json(array_filter([
            'message' => $message,
            'data' => new CashShiftResource($shift),
            'summary' => $this->cash->summary($shift),
        ], fn ($v) => $v !== null), $status);
    }
}
