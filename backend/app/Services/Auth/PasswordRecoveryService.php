<?php

namespace App\Services\Auth;

use App\Mail\PasswordChangedMail;
use App\Mail\PasswordResetMail;
use App\Models\Customer;
use App\Models\CustomerPasswordResetToken;
use App\Models\User;
use App\Services\AuditService;
use App\Services\MailService;
use App\Services\SettingsService;
use App\Support\SecurityQuestions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Password recovery with two factors (staff and customers):
 *   1. Link sent to the account email (proves the person owns the email).
 *   2. Answer to the security question, if the account configured one.
 *
 * Staff tokens live in `password_reset_tokens`, customer tokens in
 * `customer_password_reset_tokens`. Both store only a SHA-256 hash.
 */
class PasswordRecoveryService
{
    private const MAX_ANSWER_ATTEMPTS = 3;

    private const RESEND_COOLDOWN_SECONDS = 60;

    public function __construct(
        private readonly SettingsService $settings,
        private readonly AuditService $audit,
        private readonly MailService $mailer,
    ) {}

    /**
     * Step 1. Silent when the email does not exist: the caller always
     * answers the same message, so nobody can test which emails are registered.
     */
    public function requestReset(string $actor, string $email): void
    {
        $account = $this->findAccount($actor, $email);

        if (! $account || ! $account->is_active || $this->recentlyRequested($account)) {
            return;
        }

        $token = Str::random(64);
        $this->storeToken($account, $token);

        $path = $account instanceof User ? '/recuperar-contrasena' : '/portal/recuperar-contrasena';
        $url = config('app.frontend_url').$path.'?'.http_build_query(['token' => $token, 'email' => $account->email]);

        $this->mailer->send(
            new PasswordResetMail($account->name, $url, $this->minutes(), (bool) $account->security_answer_hash),
            $account,
            'password_recovery',
        );

        $this->log($account, 'password_reset_requested', 'Solicitud de recuperación de contraseña por correo');
    }

    /**
     * Step 2. The link was opened: returns the security question to show.
     *
     * @return array{security_question: ?string}
     */
    public function checkToken(string $actor, string $email, string $token): array
    {
        [$account] = $this->resolve($actor, $email, $token);

        return ['security_question' => SecurityQuestions::text($account->security_question)];
    }

    /** Step 3. New password, after checking the security answer. */
    public function reset(string $actor, string $email, string $token, ?string $answer, string $password): void
    {
        [$account, $record] = $this->resolve($actor, $email, $token);

        if ($account->security_answer_hash
            && ($answer === null || ! Hash::check(SecurityQuestions::normalize($answer), $account->security_answer_hash))) {
            $this->failAnswer($account, $record);
        }

        DB::transaction(function () use ($account, $record, $password) {
            $account->password = $password; // hashed by the model cast (Bcrypt)
            $account->must_change_password = false;
            $account->failed_attempts = 0;
            $account->locked_until = null; // recovering also unlocks the account

            if ($account instanceof Customer) {
                $account->password_changed_at = now();
                $account->temporary_password_encrypted = null;
                $account->temporary_password_expires_at = null;
            }

            $account->save();
            $account->tokens()->delete(); // close every session
            $this->consume($account, $record);
        });

        $this->log($account, 'password_reset', 'Contraseña restablecida con enlace por correo'
            .($account->security_answer_hash ? ' y pregunta de seguridad' : ''));

        $this->mailer->send(new PasswordChangedMail($account->name), $account, 'password_changed');
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

    private function findAccount(string $actor, string $email): User|Customer|null
    {
        return $actor === AuthService::STAFF
            ? User::where('email', $email)->first()
            : Customer::where('email', $email)->first();
    }

    /**
     * Valid account + valid, unexpired token, or a generic error.
     *
     * @return array{0: User|Customer, 1: object}
     */
    private function resolve(string $actor, string $email, string $token): array
    {
        $account = $this->findAccount($actor, $email);
        $record = $account?->is_active ? $this->findValidRecord($account) : null;

        $storedHash = $record ? ($record->token ?? $record->token_hash) : null;

        if (! $record || ! hash_equals($storedHash, hash('sha256', $token))) {
            throw ValidationException::withMessages([
                'token' => 'El enlace no es válido o ya venció. Solicita uno nuevo.',
            ]);
        }

        return [$account, $record];
    }

    private function findValidRecord(User|Customer $account): ?object
    {
        if ($account instanceof User) {
            $row = DB::table('password_reset_tokens')->where('email', $account->email)->first();

            return $row && Carbon::parse($row->created_at)->addMinutes($this->minutes())->isFuture() ? $row : null;
        }

        return CustomerPasswordResetToken::where('customer_id', $account->id)
            ->whereNull('used_at')
            ->where('expires_at', '>', now())
            ->latest('id')
            ->first();
    }

    private function storeToken(User|Customer $account, string $token): void
    {
        $hash = hash('sha256', $token);

        if ($account instanceof User) {
            // One row per email: a new request replaces (invalidates) the previous link
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

    private function recentlyRequested(User|Customer $account): bool
    {
        $last = $account instanceof User
            ? DB::table('password_reset_tokens')->where('email', $account->email)->value('created_at')
            : CustomerPasswordResetToken::where('customer_id', $account->id)->latest('id')->value('created_at');

        return $last && Carbon::parse($last)->addSeconds(self::RESEND_COOLDOWN_SECONDS)->isFuture();
    }

    private function failAnswer(User|Customer $account, object $record): never
    {
        $attempts = $record->question_attempts + 1;

        if ($attempts >= self::MAX_ANSWER_ATTEMPTS) {
            $this->consume($account, $record);
            $this->log($account, 'password_reset_blocked', 'Enlace de recuperación anulado por respuestas incorrectas');

            throw ValidationException::withMessages([
                'token' => 'Demasiadas respuestas incorrectas. Solicita un nuevo enlace.',
            ]);
        }

        if ($account instanceof User) {
            DB::table('password_reset_tokens')->where('email', $account->email)->update(['question_attempts' => $attempts]);
        } else {
            $record->update(['question_attempts' => $attempts]);
        }

        $left = self::MAX_ANSWER_ATTEMPTS - $attempts;
        $this->log($account, 'password_reset_wrong_answer', "Respuesta de seguridad incorrecta ({$attempts} de ".self::MAX_ANSWER_ATTEMPTS.')');

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

    private function minutes(): int
    {
        return $this->settings->int('password_reset_minutes', 60);
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
