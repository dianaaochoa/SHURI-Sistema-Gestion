<?php

namespace App\Services\Auth;

use App\Mail\TwoFactorCodeMail;
use App\Models\TwoFactorChallenge;
use App\Models\User;
use App\Services\AuditService;
use App\Services\MailService;
use App\Services\SettingsService;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Multi-factor authentication for staff: after the password, a 6-digit
 * code is emailed and the session is only opened when it matches.
 * Email instead of SMS because the project does not send SMS (README §5.2).
 */
class TwoFactorService
{
    private const RESEND_COOLDOWN_SECONDS = 60;

    public function __construct(
        private readonly SettingsService $settings,
        private readonly AuditService $audit,
        private readonly Request $request,
        private readonly MailService $mailer,
    ) {}

    public function requiredFor(User $user): bool
    {
        return (bool) $this->settings->get('staff_mfa_enabled', true) && $user->two_factor_enabled;
    }

    /**
     * Creates the challenge and emails the first code.
     *
     * @return array{challenge_id: string, expires_at: Carbon, email_hint: string}
     */
    public function start(User $user, ?string $deviceName): array
    {
        // Only one pending challenge per user
        TwoFactorChallenge::where('user_id', $user->id)->whereNull('consumed_at')->delete();

        $challengeId = Str::random(64);
        $code = $this->newCode();

        $challenge = TwoFactorChallenge::create([
            'user_id' => $user->id,
            'challenge_hash' => hash('sha256', $challengeId),
            'code_hash' => Hash::make($code),
            'device_name' => $deviceName,
            'ip_address' => $this->request->ip(),
            'expires_at' => now()->addMinutes($this->codeMinutes()),
            'last_sent_at' => now(),
        ]);

        $this->send($user, $code);
        $this->audit->log('auth', 'mfa_code_sent', 'Código de verificación enviado por correo', $user->id, 'users', $user->id);

        return [
            'challenge_id' => $challengeId,
            'expires_at' => $challenge->expires_at,
            'email_hint' => self::maskEmail($user->email),
        ];
    }

    /**
     * Sends a new code for the same challenge (at most once per minute).
     *
     * @return array{challenge_id: string, expires_at: Carbon, email_hint: string}
     */
    public function resend(string $challengeId): array
    {
        $challenge = $this->findPending($challengeId);

        $wait = self::RESEND_COOLDOWN_SECONDS - (int) $challenge->last_sent_at->diffInSeconds(now());
        if ($wait > 0) {
            throw ValidationException::withMessages([
                'challenge_id' => "Espera {$wait} segundos para pedir otro código.",
            ]);
        }

        $code = $this->newCode();
        $challenge->forceFill([
            'code_hash' => Hash::make($code),
            'attempts' => 0,
            'expires_at' => now()->addMinutes($this->codeMinutes()),
            'last_sent_at' => now(),
        ])->save();

        $this->send($challenge->user, $code);
        $this->audit->log('auth', 'mfa_code_sent', 'Código de verificación reenviado', $challenge->user_id, 'users', $challenge->user_id);

        return [
            'challenge_id' => $challengeId,
            'expires_at' => $challenge->expires_at,
            'email_hint' => self::maskEmail($challenge->user->email),
        ];
    }

    /**
     * Checks the code. Returns the user and the device name of the login.
     *
     * @return array{user: User, device_name: ?string}
     */
    public function verify(string $challengeId, string $code): array
    {
        $maxAttempts = $this->settings->int('mfa_max_attempts', 5);

        // Locked row: two simultaneous requests cannot use the same code
        [$challenge, $error] = DB::transaction(function () use ($challengeId, $code, $maxAttempts) {
            $challenge = TwoFactorChallenge::with('user')
                ->where('challenge_hash', hash('sha256', $challengeId))
                ->pending()
                ->lockForUpdate()
                ->first();

            if (! $challenge || ! $challenge->user?->is_active) {
                return [null, 'expired'];
            }

            if (! Hash::check($code, $challenge->code_hash)) {
                $challenge->attempts++;
                if ($challenge->attempts >= $maxAttempts) {
                    $challenge->consumed_at = now(); // burn it: must log in again
                }
                $challenge->save();

                return [$challenge, 'wrong'];
            }

            $challenge->forceFill(['consumed_at' => now()])->save();

            return [$challenge, null];
        });

        if ($error === 'expired') {
            $this->expired();
        }

        if ($error === 'wrong') {
            $left = $maxAttempts - $challenge->attempts;
            $this->audit->log('auth', 'mfa_failed', "Código incorrecto ({$challenge->attempts} de {$maxAttempts})", $challenge->user_id, 'users', $challenge->user_id);

            if ($left <= 0) {
                $this->expired('Demasiados intentos con el código. Inicia sesión de nuevo.');
            }

            throw ValidationException::withMessages([
                'code' => "El código no es correcto. Te quedan {$left} intento(s).",
            ]);
        }

        return ['user' => $challenge->user, 'device_name' => $challenge->device_name];
    }

    /** "brisa.luna@gmail.com" → "b********@gmail.com" */
    public static function maskEmail(string $email): string
    {
        [$local, $domain] = array_pad(explode('@', $email, 2), 2, '');

        return mb_substr($local, 0, 1).str_repeat('*', max(3, mb_strlen($local) - 1)).'@'.$domain;
    }

    private function findPending(string $challengeId): TwoFactorChallenge
    {
        $challenge = TwoFactorChallenge::with('user')
            ->where('challenge_hash', hash('sha256', $challengeId))
            ->pending()
            ->first();

        if (! $challenge || ! $challenge->user?->is_active) {
            $this->expired();
        }

        return $challenge;
    }

    private function send(User $user, string $code): void
    {
        $sent = $this->mailer->send(
            new TwoFactorCodeMail($user->name, $code, $this->codeMinutes()),
            $user,
            'two_factor_code',
        );

        if (! $sent) {
            throw new HttpResponseException(response()->json([
                'message' => 'No pudimos enviar el código a tu correo. Intenta de nuevo en unos minutos.',
                'code' => 'MAIL_FAILED',
            ], 503));
        }
    }

    private function expired(string $message = 'El código venció o ya no es válido. Inicia sesión de nuevo.'): never
    {
        throw ValidationException::withMessages(['challenge_id' => $message]);
    }

    private function newCode(): string
    {
        return str_pad((string) random_int(0, 999_999), 6, '0', STR_PAD_LEFT);
    }

    private function codeMinutes(): int
    {
        return $this->settings->int('mfa_code_minutes', 10);
    }
}
