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
 * Login, lockout, token issuing and password change for staff (users)
 * and customers (portal). Controllers only translate HTTP <-> this service.
 */
class AuthService
{
    /** Token abilities: they separate staff tokens from portal tokens. */
    public const STAFF = 'staff';

    public const CUSTOMER = 'customer';

    public function __construct(
        private readonly SettingsService $settings,
        private readonly AuditService $audit,
        private readonly SessionService $sessions,
        private readonly TwoFactorService $twoFactor,
    ) {}

    /**
     * Password first; if MFA applies, sends the email code instead of a token.
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
                // The temporary password printed on the reception sheet expires (RF-06)
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

    /** AD7: the admin unlocks a staff account blocked by failed attempts. */
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
     * Sets the user's own password (mandatory on first access) and closes
     * every other session, so a leaked temporary password stops working.
     */
    public function changePassword(Authenticatable $account, string $currentPassword, string $newPassword): void
    {
        if (! Hash::check($currentPassword, $account->password)) {
            throw ValidationException::withMessages([
                'current_password' => 'La contraseña actual no es correcta.',
            ]);
        }

        $account->password = $newPassword; // hashed by the model cast (Bcrypt)
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
     * Opens the session once every factor was verified.
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
     * First factor: password + lockout. Returns the account when correct.
     */
    private function verifyCredentials(
        User|Customer|null $account,
        string $password,
        int $maxAttempts,
        int $lockMinutes,
        ?callable $afterPasswordCheck = null,
    ): User|Customer {
        if (! $account || ! $account->is_active || ! $account->password) {
            // Same work as a real check so response time does not reveal valid emails
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
            // lockMinutes = 0 → stays locked until an admin unlocks it (A.2)
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
        // Generic message: never say whether the user or the password was wrong
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
