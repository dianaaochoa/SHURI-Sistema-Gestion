<?php

namespace App\Exceptions;

use Carbon\CarbonInterface;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use RuntimeException;

/**
 * Se lanza cuando una cuenta superó los intentos fallidos permitidos.
 * Responde HTTP 423 (Locked). Hay dos tipos de bloqueo:
 *  - Por tiempo: locked_until = ahora + N minutos (se desbloquea sola).
 *  - Hasta que el administrador la desbloquee: locked_until = UNTIL_ADMIN (año 9999).
 */
class AccountLockedException extends RuntimeException
{
    /** Fecha que nunca llega: solo el administrador (o la recuperación de contraseña) la quita. */
    public const UNTIL_ADMIN = '9999-12-31 23:59:59';

    public function __construct(public readonly CarbonInterface $lockedUntil)
    {
        parent::__construct('Cuenta bloqueada.');
    }

    public static function untilAdmin(): Carbon
    {
        return Carbon::parse(self::UNTIL_ADMIN);
    }

    public static function isUntilAdmin(?CarbonInterface $lockedUntil): bool
    {
        return $lockedUntil !== null && $lockedUntil->year >= 9999;
    }

    public function render(): JsonResponse
    {
        if (self::isUntilAdmin($this->lockedUntil)) {
            return response()->json([
                'message' => 'Tu cuenta está bloqueada por seguridad. Pide al administrador que la desbloquee.',
                'code' => 'ACCOUNT_LOCKED',
                'unlock' => 'admin',
                'retry_after_minutes' => null,
            ], 423);
        }

        $minutes = max(1, (int) ceil(now()->diffInSeconds($this->lockedUntil, false) / 60));

        return response()->json([
            'message' => "Demasiados intentos fallidos. Intenta de nuevo en {$minutes} minuto(s).",
            'code' => 'ACCOUNT_LOCKED',
            'unlock' => 'time',
            'retry_after_minutes' => $minutes,
        ], 423);
    }
}
