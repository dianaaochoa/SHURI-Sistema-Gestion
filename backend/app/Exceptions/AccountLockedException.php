<?php

namespace App\Exceptions;

use Carbon\CarbonInterface;
use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * Thrown when an account exceeded the allowed failed login attempts.
 * Rendered as HTTP 423 (Locked) with the minutes left.
 */
class AccountLockedException extends RuntimeException
{
    public function __construct(public readonly CarbonInterface $lockedUntil)
    {
        parent::__construct('Cuenta bloqueada temporalmente.');
    }

    public function render(): JsonResponse
    {
        $minutes = max(1, (int) ceil(now()->diffInSeconds($this->lockedUntil, false) / 60));

        return response()->json([
            'message' => "Demasiados intentos fallidos. Intenta de nuevo en {$minutes} minuto(s).",
            'code' => 'ACCOUNT_LOCKED',
            'retry_after_minutes' => $minutes,
        ], 423);
    }
}
