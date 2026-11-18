<?php

namespace App\Support;

use App\Models\OrderStatus as S;
use Illuminate\Validation\ValidationException;

/**
 * Máquina de estados de una orden de servicio (diagrama del README §14.4).
 * Define qué cambios de estado están permitidos; cualquier otro se rechaza.
 * La pausa no es un estado: se marca con `is_paused` sin cambiar el estado.
 */
final class OrderStatusFlow
{
    /** @var array<string, array<int, string>> estado actual => estados a los que puede pasar */
    public const TRANSITIONS = [
        S::RECEIVED => [S::ASSIGNED, S::CANCELLED],
        S::ASSIGNED => [S::DIAGNOSING, S::CANCELLED],
        S::DIAGNOSING => [S::QUOTING, S::NOT_REPAIRABLE, S::AWAITING_CUSTOMER],
        S::AWAITING_CUSTOMER => [S::DIAGNOSING],
        S::QUOTING => [S::QUOTE_PENDING, S::DIAGNOSING],
        S::QUOTE_PENDING => [S::IN_REPAIR, S::QUOTE_REJECTED],
        S::IN_REPAIR => [S::QUOTE_PENDING, S::READY_FOR_PICKUP],
        S::QUOTE_REJECTED => [S::DELIVERED, S::ABANDONED],
        S::NOT_REPAIRABLE => [S::DELIVERED, S::ABANDONED],
        S::READY_FOR_PICKUP => [S::DELIVERED, S::ABANDONED],
        S::ABANDONED => [S::DELIVERED, S::DISPOSED],
        S::DELIVERED => [],
        S::DISPOSED => [],
        S::CANCELLED => [],
    ];

    /** Estados en los que el técnico puede trabajar con el cronómetro corriendo. */
    public const WORKING = [S::DIAGNOSING, S::IN_REPAIR];

    public static function can(string $from, string $to): bool
    {
        return in_array($to, self::TRANSITIONS[$from] ?? [], true);
    }

    /** Lanza un error de validación si el cambio no está permitido. */
    public static function assert(string $from, string $to, string $fromName): void
    {
        if (! self::can($from, $to)) {
            throw ValidationException::withMessages([
                'status' => "La orden está «{$fromName}» y no puede pasar a ese estado.",
            ]);
        }
    }
}
