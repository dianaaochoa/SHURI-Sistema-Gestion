<?php

namespace App\Services\Auth;

use App\Models\Customer;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Laravel\Sanctum\NewAccessToken;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Multi-session management. Every Sanctum token is one session on one
 * device: it can be listed, closed remotely or closed all at once.
 */
class SessionService
{
    public function __construct(
        private readonly Request $request,
        private readonly AuditService $audit,
    ) {}

    /** Opens a new session for the account on the current device. */
    public function issue(User|Customer $account, string $ability, ?string $deviceName): NewAccessToken
    {
        $expiresAt = now()->addMinutes((int) config('sanctum.expiration', 480));

        $token = $account->createToken($deviceName ?: 'web', [$ability], $expiresAt);

        $token->accessToken->forceFill([
            'ip_address' => $this->request->ip(),
            'user_agent' => Str::limit((string) $this->request->userAgent(), 250, ''),
        ])->save();

        return $token;
    }

    /**
     * Active (not expired) sessions of the account, most recent first.
     *
     * @return Collection<int, PersonalAccessToken>
     */
    public function active(User|Customer $account): Collection
    {
        return $account->tokens()
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->orderByDesc('last_used_at')
            ->orderByDesc('created_at')
            ->get();
    }

    /** Closes one session of the account. Returns false if it is not theirs. */
    public function revoke(User|Customer $account, int $sessionId, ?User $by = null): bool
    {
        $token = $account->tokens()->whereKey($sessionId)->first();

        if (! $token) {
            return false;
        }

        $token->delete();
        $this->log($account, 'session_revoked', "Sesión cerrada: {$token->name}", $by);

        return true;
    }

    /** Closes every session except the current one. Returns how many were closed. */
    public function revokeOthers(User|Customer $account): int
    {
        $current = $account->currentAccessToken();

        $closed = $account->tokens()
            ->when($current instanceof PersonalAccessToken, fn ($q) => $q->whereKeyNot($current->getKey()))
            ->delete();

        $this->log($account, 'sessions_revoked', "Se cerraron {$closed} sesión(es) en otros dispositivos");

        return $closed;
    }

    /** Admin action: close all sessions of a staff member (e.g. lost device). */
    public function revokeAll(User $account, User $by): int
    {
        $closed = $account->tokens()->delete();

        $this->log($account, 'sessions_revoked', "El administrador cerró {$closed} sesión(es) de {$account->username}", $by);

        return $closed;
    }

    public function expiresAt(NewAccessToken $token): Carbon
    {
        return Carbon::parse($token->accessToken->expires_at);
    }

    private function log(User|Customer $account, string $action, string $description, ?User $by = null): void
    {
        if ($account instanceof User) {
            $this->audit->log('auth', $action, $description, $by?->id ?? $account->id, 'users', $account->id);

            return;
        }

        $this->audit->log('portal', $action, "{$description} (cliente #{$account->id})", null, 'customers', $account->id);
    }
}
