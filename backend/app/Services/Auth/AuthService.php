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
    ) {}

    /**
     * @return array{account: User, token: string, expires_at: Carbon}
     */
    public function loginStaff(string $login, string $password, ?string $deviceName): array
    {
        $user = User::with('role')
            ->where(fn ($q) => $q->where('email', $login)->orWhere('username', $login))
            ->first();

        return $this->attempt(
            $user, $password, $deviceName, self::STAFF,
            $this->settings->int('staff_max_attempts', 5),
            $this->settings->int('staff_lock_minutes', 15),
        );
    }

    /**
     * @return array{account: Customer, token: string, expires_at: Carbon}
     */
    public function loginCustomer(string $email, string $password, ?string $deviceName): array
    {
        $customer = Customer::where('email', $email)->first();

        return $this->attempt(
            $customer, $password, $deviceName, self::CUSTOMER,
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
    }

    public function logout(Authenticatable $account): void
    {
        $token = $account->currentAccessToken();

        if ($token instanceof PersonalAccessToken) {
            $token->delete();
        }

        $this->auditFor($account, 'logout', 'Cierre de sesión');
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
     * @return array{account: User|Customer, token: string, expires_at: Carbon}
     */
    private function attempt(
        User|Customer|null $account,
        string $password,
        ?string $deviceName,
        string $ability,
        int $maxAttempts,
        int $lockMinutes,
        ?callable $afterPasswordCheck = null,
    ): array {
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

        $account->forceFill([
            'failed_attempts' => 0,
            'locked_until' => null,
            'last_login_at' => now(),
        ])->save();

        $token = $this->sessions->issue($account, $ability, $deviceName);

        $this->auditFor($account, 'login', 'Inicio de sesión');

        return [
            'account' => $account,
            'token' => $token->plainTextToken,
            'expires_at' => $this->sessions->expiresAt($token),
        ];
    }

    private function registerFailure(User|Customer $account, int $maxAttempts, int $lockMinutes): never
    {
        $attempts = $account->failed_attempts + 1;

        if ($attempts >= $maxAttempts) {
            $account->forceFill(['failed_attempts' => 0, 'locked_until' => now()->addMinutes($lockMinutes)])->save();
            $this->auditFor($account, 'login_locked', "Cuenta bloqueada {$lockMinutes} min por {$maxAttempts} intentos fallidos");

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
