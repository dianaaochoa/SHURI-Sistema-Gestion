<?php

namespace App\Http\Controllers\Api\Workshop;

use App\Http\Controllers\Controller;
use App\Models\ServiceOrder;
use App\Services\Workshop\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Resguardo y abandono de equipos (RF-09, J9): equipos sin recoger, bodega,
 * desecho electrónico y perdón del almacenaje.
 */
class StorageController extends Controller
{
    public function __construct(private readonly StorageService $storage) {}

    /** GET /storage?alert=grace_period|charging|abandonment_notice|abandon|abandoned */
    public function index(Request $request): JsonResponse
    {
        $alert = $request->validate([
            'alert' => ['nullable', 'in:grace_period,charging,abandonment_notice,abandon,abandoned'],
        ])['alert'] ?? null;

        $devices = $this->storage->devices($alert);

        return response()->json([
            'summary' => [
                'waiting' => count(array_filter($devices, fn ($d) => $d['alert'] !== 'abandoned')),
                'charging' => count(array_filter($devices, fn ($d) => $d['alert'] === 'charging')),
                'about_to_be_abandoned' => count(array_filter($devices, fn ($d) => in_array($d['alert'], ['abandonment_notice', 'abandon'], true))),
                'abandoned' => count(array_filter($devices, fn ($d) => $d['alert'] === 'abandoned')),
            ],
            'data' => $devices,
        ]);
    }

    /** POST /storage/process — corre ahora el proceso diario (avisos y abandono) */
    public function process(Request $request): JsonResponse
    {
        $result = $this->storage->process($request->user());
        $count = count($result['abandoned']);

        return response()->json([
            'message' => "Proceso terminado: {$count} equipo(s) pasaron a En Abandono.",
            'data' => $result,
        ]);
    }

    /** POST /service-orders/{folio}/send-to-storage */
    public function sendToStorage(Request $request, string $folio): JsonResponse
    {
        $order = $this->find($folio);

        if ($order instanceof JsonResponse) {
            return $order;
        }

        $this->storage->sendToStorage($order, $request->user());

        return response()->json(['message' => "El equipo {$folio} quedó en bodega.", 'data' => $this->row($order->fresh('status'))]);
    }

    /** POST /service-orders/{folio}/dispose */
    public function dispose(Request $request, string $folio): JsonResponse
    {
        $notes = $request->validate(['notes' => ['nullable', 'string', 'max:255']], [], ['notes' => 'notas'])['notes'] ?? null;
        $order = $this->find($folio);

        if ($order instanceof JsonResponse) {
            return $order;
        }

        return response()->json([
            'message' => "El equipo {$folio} se envió a desecho electrónico.",
            'data' => $this->row($this->storage->dispose($order, $request->user(), $notes)),
        ]);
    }

    /** POST /service-orders/{folio}/waive-storage */
    public function waive(Request $request, string $folio): JsonResponse
    {
        $reason = $request->validate(['reason' => ['required', 'string', 'min:5', 'max:200']], [], ['reason' => 'motivo'])['reason'];
        $order = $this->find($folio);

        if ($order instanceof JsonResponse) {
            return $order;
        }

        return response()->json([
            'message' => 'Almacenaje perdonado.',
            'data' => $this->row($this->storage->waive($order, $request->user(), $reason)->fresh('status')),
        ]);
    }

    private function find(string $folio): ServiceOrder|JsonResponse
    {
        return ServiceOrder::with('status')->where('folio', $folio)->first()
            ?? response()->json(['message' => "No existe la orden {$folio}.", 'code' => 'NOT_FOUND'], 404);
    }

    /** @return array<string, mixed> */
    private function row(ServiceOrder $order): array
    {
        return [
            'folio' => $order->folio,
            'status_code' => $order->status->code,
            'status' => $order->status->name,
            'location' => $order->location,
            'sent_to_storage_at' => $order->sent_to_storage_at?->toIso8601String(),
            'storage_fee' => $this->storage->feeFor($order),
            'storage_fee_waived' => (bool) $order->storage_fee_waived,
            'abandoned_at' => $order->abandoned_at?->toIso8601String(),
            'disposed_at' => $order->disposed_at?->toIso8601String(),
        ];
    }
}
