<?php

namespace App\Services\Auth;

use App\Mail\TemporaryPasswordMail;
use App\Models\Customer;
use App\Models\CustomerPasswordResetToken;
use App\Models\User;
use App\Services\AuditService;
use App\Services\MailService;
use App\Services\SettingsService;
use App\Support\SecurityQuestions;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Password recovery following the Figma flow (A.3), with two factors:
 *   1. Something the person knows: the answer to their security question.
 *   2. Something the person has: their email, where the temporary password arrives.
 * After logging in with the temporary password, the system forces them to
 * create a new one (A.5, must_change_password).
 *
 * The pending recovery (recovery_id, stored as SHA-256) lives in
 * `password_reset_tokens` (staff) or `customer_password_reset_tokens` (customers).
 */
class PasswordRecoveryService
{
    private const MAX_ANSWER_ATTEMPTS = 3;

    public function __construct(
        private readonly SettingsService $settings,
        private readonly AuditService $audit,
        private readonly MailService $mailer,
    ) {}

    /**
     * Step 1. Returns the security question, or null when the account does not
     * exist, is inactive or has no question (same answer in the three cases,
     * so nobody can learn which accounts lack a question).
     *
     * @return array{recovery_id: string, security_question: string}|null
     */
    public function start(string $actor, string $login): ?array
    {
        $account = $this->findAccount($actor, $login);

        if (! $account || ! $account->is_active || ! $account->security_answer_hash) {
            return null;
        }

        $recoveryId = Str::random(64);
        $this->storeRecovery($account, hash('sha256', $recoveryId));

        $this->log($account, 'password_recovery_started', 'Inició la recuperación de contraseña');

        return [
            'recovery_id' => $recoveryId,
            'security_question' => SecurityQuestions::text($account->security_question),
        ];
    }

    /**
     * Step 2. Correct answer → new temporary password sent by email.
     *
     * @return array{email_hint: string}
     */
    public function answer(string $actor, string $recoveryId, string $answer): array
    {
        [$account, $record] = $this->resolve($actor, $recoveryId);

        if (! Hash::check(SecurityQuestions::normalize($answer), $account->security_answer_hash)) {
            $this->failAnswer($account, $record);
        }

        $temporary = $this->temporaryPassword();

        DB::transaction(function () use ($account, $record, $temporary) {
            $account->password = $temporary; // hashed by the model cast (Bcrypt)
            $account->must_change_password = true;
            $account->failed_attempts = 0;
            $account->locked_until = null; // recovering also unlocks the account

            if ($account instanceof Customer) {
                $account->temporary_password_expires_at = now()->addHours($this->settings->int('portal_temp_password_hours', 72));
            }

            $account->save();
            $account->tokens()->delete(); // close every session
            $this->consume($account, $record);
        });

        $sent = $this->mailer->send(
            new TemporaryPasswordMail($account->name, $account instanceof User ? $account->username : $account->email, $temporary),
            $account,
            'temporary_password',
        );

        $this->log($account, 'password_recovered', 'Pregunta de seguridad correcta: contraseña temporal enviada por correo');

        if (! $sent) {
            throw new HttpResponseException(response()->json([
                'message' => 'Respondiste bien, pero no pudimos enviar el correo. Pide una contraseña temporal al administrador.',
                'code' => 'MAIL_FAILED',
            ], 503));
        }

        return ['email_hint' => TwoFactorService::maskEmail($account->email)];
    }

    /** Configure or change the security question (requires the current password). */
    public function setSecurityQuestion(User|Customer $account, string $currentPassword, string $questionKey, string $answer): void
    {
        if (! Hash::check($currentPassword, $account->password)) {
            throw ValidationException::withMessages([
                'current_password' => 'La contraseña actual no es correcta.',
            ]);
        }

        $account->forceFill([
            'security_question' => $questionKey,
            'security_answer_hash' => Hash::make(SecurityQuestions::normalize($answer)),
        ])->save();

        $this->log($account, 'security_question_set', 'Pregunta de seguridad configurada');
    }

    /** Staff: username or email (as in the login). Customers: email. */
    private function findAccount(string $actor, string $login): User|Customer|null
    {
        return $actor === AuthService::STAFF
            ? User::where(fn ($q) => $q->where('email', $login)->orWhere('username', $login))->first()
            : Customer::where('email', $login)->first();
    }

    private function storeRecovery(User|Customer $account, string $hash): void
    {
        if ($account instanceof User) {
            // One row per email: starting again replaces the previous recovery
            DB::table('password_reset_tokens')->updateOrInsert(
                ['email' => $account->email],
                ['token' => $hash, 'question_attempts' => 0, 'created_at' => now()],
            );
            $account->forceFill(['password_reset_requested_at' => now()])->save();

            return;
        }

        CustomerPasswordResetToken::where('customer_id', $account->id)->whereNull('used_at')->update(['used_at' => now()]);
        CustomerPasswordResetToken::create([
            'customer_id' => $account->id,
            'token_hash' => $hash,
            'expires_at' => now()->addMinutes($this->minutes()),
        ]);
    }

    /**
     * Finds the pending recovery by its id, or a generic error.
     *
     * @return array{0: User|Customer, 1: object}
     */
    private function resolve(string $actor, string $recoveryId): array
    {
        $hash = hash('sha256', $recoveryId);

        if ($actor === AuthService::STAFF) {
            $record = DB::table('password_reset_tokens')->where('token', $hash)->first();
            $valid = $record && Carbon::parse($record->created_at)->addMinutes($this->minutes())->isFuture();
            $account = $valid ? User::where('email', $record->email)->first() : null;
        } else {
            $record = CustomerPasswordResetToken::with('customer')
                ->where('token_hash', $hash)
                ->whereNull('used_at')
                ->where('expires_at', '>', now())
                ->first();
            $account = $record?->customer;
        }

        if (! $account || ! $account->is_active || ! $account->security_answer_hash) {
            throw ValidationException::withMessages([
                'recovery_id' => 'La recuperación venció o ya no es válida. Empieza de nuevo.',
            ]);
        }

        return [$account, $record];
    }

    private function failAnswer(User|Customer $account, object $record): never
    {
        $attempts = $record->question_attempts + 1;

        if ($attempts >= self::MAX_ANSWER_ATTEMPTS) {
            $this->consume($account, $record);
            $this->log($account, 'password_recovery_blocked', 'Recuperación anulada por respuestas incorrectas');

            throw ValidationException::withMessages([
                'recovery_id' => 'Demasiadas respuestas incorrectas. Pide una contraseña temporal al administrador.',
            ]);
        }

        if ($account instanceof User) {
            DB::table('password_reset_tokens')->where('email', $account->email)->update(['question_attempts' => $attempts]);
        } else {
            $record->update(['question_attempts' => $attempts]);
        }

        $left = self::MAX_ANSWER_ATTEMPTS - $attempts;
        $this->log($account, 'password_recovery_wrong_answer', "Respuesta de seguridad incorrecta ({$attempts} de ".self::MAX_ANSWER_ATTEMPTS.')');

        throw ValidationException::withMessages([
            'answer' => "La respuesta no es correcta. Te quedan {$left} intento(s).",
        ]);
    }

    private function consume(User|Customer $account, object $record): void
    {
        if ($account instanceof User) {
            DB::table('password_reset_tokens')->where('email', $account->email)->delete();

            return;
        }

        $record->update(['used_at' => now()]);
    }

    /** Easy to type from the email, e.g. "Kt7mPq2xRb". It must be changed on first login. */
    private function temporaryPassword(): string
    {
        return Str::password(10, letters: true, numbers: true, symbols: false);
    }

    private function minutes(): int
    {
        return $this->settings->int('password_reset_minutes', 15);
    }

    private function log(User|Customer $account, string $action, string $description): void
    {
        if ($account instanceof User) {
            $this->audit->log('auth', $action, $description, $account->id, 'users', $account->id);

            return;
        }

        $this->audit->log('portal', $action, "{$description} (cliente #{$account->id})", null, 'customers', $account->id);
    }
}
