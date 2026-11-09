<?php

namespace App\Exceptions;

use Carbon\CarbonInterface;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use RuntimeException;

/**
 * Thrown when an account exceeded the allowed failed login attempts.
 * Rendered as HTTP 423 (Locked). Two kinds of lock:
 *  - Timed: locked_until = now + N minutes (unlocks by itself).
 *  - Until an admin unlocks it: locked_until = UNTIL_ADMIN (year 9999).
 */
class AccountLockedException extends RuntimeException
{
    /** Date that never arrives: only the admin (or password recovery) clears it. */
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
