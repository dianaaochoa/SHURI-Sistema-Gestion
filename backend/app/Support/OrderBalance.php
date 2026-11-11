<?php

namespace App\Support;

use App\Models\OrderStatus;
use App\Models\ServiceOrder;
use App\Services\SettingsService;

/**
 * Cuánto falta por cobrar de una orden de servicio al entregarla (C6).
 * - Con reparación: total (mano de obra + refacciones) + almacenaje − anticipo.
 * - Sin reparación o presupuesto rechazado: el costo de revisión (si se cobra) + almacenaje − anticipo.
 */
final class OrderBalance
{
    /** Estados en los que el equipo espera a que el cliente lo recoja. */
    public const DELIVERABLE = [
        OrderStatus::READY_FOR_PICKUP,
        OrderStatus::NOT_REPAIRABLE,
        OrderStatus::QUOTE_REJECTED,
    ];

    /** @return array{work: float, inspection_fee: float, storage_fee: float, deposit: float, amount_due: float} */
    public static function for(ServiceOrder $order): array
    {
        $work = round((float) $order->labor_cost + (float) $order->parts_cost, 2);
        $code = $order->status?->code;

        $withoutRepair = in_array($code, [OrderStatus::NOT_REPAIRABLE, OrderStatus::QUOTE_REJECTED], true);
        $inspection = $withoutRepair && $order->charge_inspection && $work <= 0
            ? (float) app(SettingsService::class)->get('inspection_fee', 300)
            : 0.0;

        $storage = $order->storage_fee_waived ? 0.0 : (float) $order->storage_fee;
        $deposit = (float) $order->deposit;

        return [
            'work' => $work,
            'inspection_fee' => $inspection,
            'storage_fee' => $storage,
            'deposit' => $deposit,
            'amount_due' => max(0.0, round($work + $inspection + $storage - $deposit, 2)),
        ];
    }
}
