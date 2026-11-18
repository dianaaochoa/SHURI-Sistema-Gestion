<?php

namespace App\Services\Auth;

use App\Exceptions\AccountLockedException;
use App\Models\Customer;
use App\Models\User;
use App\Services\AuditService;
use App\Services\SettingsService;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Acceso, bloqueo, emisión de tokens y cambio de contraseña del personal (users)
 * y de los clientes (portal). Los controladores solo traducen HTTP <-> este servicio.
 */
class AuthService
{
    /** Abilities del token: separan los tokens del personal de los del portal. */
    public const STAFF = 'staff';

    public const CUSTOMER = 'customer';

    public function __construct(
        private readonly SettingsService $settings,
        private readonly AuditService $audit,
        private readonly SessionService $sessions,
        private readonly TwoFactorService $twoFactor,
    ) {}

    /**
     * Primero la contraseña; si aplica MFA, envía el código por correo en lugar del token.
     *
     * @return array{account: User, token: string, expires_at: Carbon}
     *                                                                 |array{mfa_required: true, challenge_id: string, expires_at: Carbon, email_hint: string}
     */
    public function loginStaff(string $login, string $password, ?string $deviceName): array
    {
        $user = User::with('role')
            ->where(fn ($q) => $q->where('email', $login)->orWhere('username', $login))
            ->first();

        $user = $this->verifyCredentials(
            $user, $password,
            $this->settings->int('staff_max_attempts', 3),
            $this->settings->int('staff_lock_minutes', 0), // 0 = until the admin unlocks it
        );

        if ($this->twoFactor->requiredFor($user)) {
            return ['mfa_required' => true] + $this->twoFactor->start($user, $deviceName);
        }

        return $this->completeLogin($user, self::STAFF, $deviceName);
    }

    /**
     * @return array{account: Customer, token: string, expires_at: Carbon}
     */
    public function loginCustomer(string $email, string $password, ?string $deviceName): array
    {
        $customer = Customer::where('email', $email)->first();

        $customer = $this->verifyCredentials(
            $customer, $password,
            $this->settings->int('portal_max_attempts', 5),
            $this->settings->int('portal_lock_minutes', 15),
            function (Customer $customer) {
                // La contraseña temporal impresa en la hoja de recepción vence (RF-06)
                if ($customer->must_change_password && $customer->temporary_password_expires_at?->isPast()) {
                    throw ValidationException::withMessages([
                        'password' => 'Tu contraseña temporal venció. Pide una nueva en la sucursal.',
                    ]);
                }
            },
        );

        return $this->completeLogin($customer, self::CUSTOMER, $deviceName);
    }

    public function logout(Authenticatable $account): void
    {
        $token = $account->currentAccessToken();

        if ($token instanceof PersonalAccessToken) {
            $token->delete();
        }

        $this->auditFor($account, 'logout', 'Cierre de sesión');
    }

    /** AD7: el administrador desbloquea una cuenta bloqueada por intentos fallidos. */
    public function unlock(User $user, User $admin): bool
    {
        if (! $user->locked_until && $user->failed_attempts === 0) {
            return false;
        }

        $user->forceFill(['failed_attempts' => 0, 'locked_until' => null])->save();

        $this->audit->log('auth', 'account_unlocked', "El administrador desbloqueó la cuenta de {$user->username}", $admin->id, 'users', $user->id);

        return true;
    }

    /**
     * Guarda la contraseña propia del usuario (obligatoria en el primer acceso) y cierra
     * las demás sesiones, para que una contraseña temporal filtrada deje de servir.
     */
    public function changePassword(Authenticatable $account, string $currentPassword, string $newPassword): void
    {
        if (! Hash::check($currentPassword, $account->password)) {
            throw ValidationException::withMessages([
                'current_password' => 'La contraseña actual no es correcta.',
            ]);
        }

        $account->password = $newPassword; // el cast del modelo aplica el hash (Bcrypt)
        $account->must_change_password = false;

        if ($account instanceof Customer) {
            $account->password_changed_at = now();
            $account->temporary_password_encrypted = null;
            $account->temporary_password_expires_at = null;
        }

        $account->save();

        $current = $account->currentAccessToken();
        $account->tokens()
            ->when($current instanceof PersonalAccessToken, fn ($q) => $q->whereKeyNot($current->getKey()))
            ->delete();

        $this->auditFor($account, 'password_changed', 'Cambio de contraseña');
    }

    /**
     * Abre la sesión cuando ya se verificaron todos los factores.
     *
     * @return array{account: User|Customer, token: string, expires_at: Carbon}
     */
    public function completeLogin(User|Customer $account, string $ability, ?string $deviceName): array
    {
        $account->forceFill(['last_login_at' => now()])->save();

        $token = $this->sessions->issue($account, $ability, $deviceName);

        $this->auditFor($account, 'login', 'Inicio de sesión');

        return [
            'account' => $account,
            'token' => $token->plainTextToken,
            'expires_at' => $this->sessions->expiresAt($token),
        ];
    }

    /**
     * Primer factor: contraseña + bloqueo. Devuelve la cuenta si es correcta.
     */
    private function verifyCredentials(
        User|Customer|null $account,
        string $password,
        int $maxAttempts,
        int $lockMinutes,
        ?callable $afterPasswordCheck = null,
    ): User|Customer {
        if (! $account || ! $account->is_active || ! $account->password) {
            // El mismo trabajo que una verificación real, para que el tiempo de respuesta no revele correos válidos
            static $dummyHash = null;
            Hash::check($password, $dummyHash ??= Hash::make('shuri-dummy-password'));
            $this->failed();
        }

        if ($account->locked_until?->isFuture()) {
            throw new AccountLockedException($account->locked_until);
        }

        if (! Hash::check($password, $account->password)) {
            $this->registerFailure($account, $maxAttempts, $lockMinutes);
        }

        if ($afterPasswordCheck) {
            $afterPasswordCheck($account);
        }

        $account->forceFill(['failed_attempts' => 0, 'locked_until' => null])->save();

        return $account;
    }

    private function registerFailure(User|Customer $account, int $maxAttempts, int $lockMinutes): never
    {
        $attempts = $account->failed_attempts + 1;

        if ($attempts >= $maxAttempts) {
            // lockMinutes = 0 → queda bloqueada hasta que el administrador la desbloquee (A.2)
            $lockedUntil = $lockMinutes > 0 ? now()->addMinutes($lockMinutes) : AccountLockedException::untilAdmin();

            $account->forceFill(['failed_attempts' => 0, 'locked_until' => $lockedUntil])->save();
            $this->auditFor($account, 'login_locked', $lockMinutes > 0
                ? "Cuenta bloqueada {$lockMinutes} min por {$maxAttempts} intentos fallidos"
                : "Cuenta bloqueada hasta que el administrador la desbloquee ({$maxAttempts} intentos fallidos)");

            throw new AccountLockedException($account->locked_until);
        }

        $account->forceFill(['failed_attempts' => $attempts])->save();
        $this->auditFor($account, 'login_failed', "Intento fallido {$attempts} de {$maxAttempts}");

        $this->failed();
    }

    private function failed(): never
    {
        // Mensaje genérico: nunca decir si falló el usuario o la contraseña
        throw ValidationException::withMessages([
            'login' => 'Usuario o contraseña incorrectos.',
        ]);
    }

    private function auditFor(Authenticatable $account, string $action, string $description): void
    {
        if ($account instanceof User) {
            $this->audit->log('auth', $action, $description, $account->id, 'users', $account->id);

            return;
        }

        $this->audit->log('portal', $action, "{$description} (cliente #{$account->getKey()})", null, 'customers', $account->getKey());
    }
}
