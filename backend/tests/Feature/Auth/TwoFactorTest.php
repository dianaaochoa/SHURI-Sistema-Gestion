<?php

namespace Tests\Feature\Auth;

use App\Mail\TwoFactorCodeMail;
use App\Models\TwoFactorChallenge;
use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * MFA for staff: password + 6-digit code sent by email.
 */
class TwoFactorTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();
        $this->withoutMiddleware(ThrottleRequests::class);
    }

    /** Logs in with the password and returns [challenge_id, code received by email]. */
    private function startLogin(string $login = 'carlos'): array
    {
        $challengeId = $this->postJson('/api/v1/auth/login', [
            'login' => $login,
            'password' => 'Password123',
            'device_name' => 'PC Taller',
        ])->assertOk()->json('challenge_id');

        return [$challengeId, $this->lastCode()];
    }

    private function lastCode(): string
    {
        $code = null;
        Mail::assertSent(TwoFactorCodeMail::class, function (TwoFactorCodeMail $mail) use (&$code) {
            $code = $mail->code;

            return true;
        });

        return $code;
    }

    public function test_password_alone_does_not_open_a_session_when_mfa_is_on(): void
    {
        $user = User::factory()->withTwoFactor()->create(['username' => 'carlos', 'email' => 'carlos@shuri.test']);

        $this->postJson('/api/v1/auth/login', ['login' => 'carlos', 'password' => 'Password123'])
            ->assertOk()
            ->assertJsonPath('mfa_required', true)
            ->assertJsonPath('email_hint', 'c*****@shuri.test')
            ->assertJsonMissingPath('token');

        $this->assertDatabaseCount('personal_access_tokens', 0);
        Mail::assertSent(TwoFactorCodeMail::class, fn ($mail) => $mail->hasTo('carlos@shuri.test'));
        $this->assertDatabaseHas('sent_emails', ['user_id' => $user->id, 'type' => 'two_factor_code', 'status' => 'sent']);
    }

    public function test_code_and_challenge_are_stored_hashed(): void
    {
        User::factory()->withTwoFactor()->create(['username' => 'carlos']);
        [$challengeId, $code] = $this->startLogin();

        $row = DB::table('two_factor_challenges')->first();
        $this->assertNotSame($code, $row->code_hash);
        $this->assertNotSame($challengeId, $row->challenge_hash);
        $this->assertSame(hash('sha256', $challengeId), $row->challenge_hash);
    }

    public function test_correct_code_opens_the_session(): void
    {
        $user = User::factory()->withTwoFactor()->create(['username' => 'carlos']);
        [$challengeId, $code] = $this->startLogin();

        $this->postJson('/api/v1/auth/2fa/verify', ['challenge_id' => $challengeId, 'code' => $code])
            ->assertOk()
            ->assertJsonStructure(['token', 'expires_at', 'user' => ['id', 'permissions']])
            ->assertJsonPath('user.id', $user->id);

        $this->assertDatabaseHas('personal_access_tokens', ['tokenable_id' => $user->id, 'name' => 'PC Taller']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'login', 'user_id' => $user->id]);
    }

    public function test_code_can_only_be_used_once(): void
    {
        User::factory()->withTwoFactor()->create(['username' => 'carlos']);
        [$challengeId, $code] = $this->startLogin();

        $this->postJson('/api/v1/auth/2fa/verify', ['challenge_id' => $challengeId, 'code' => $code])->assertOk();
        $this->postJson('/api/v1/auth/2fa/verify', ['challenge_id' => $challengeId, 'code' => $code])
            ->assertStatus(422)
            ->assertJsonValidationErrors('challenge_id');
    }

    public function test_code_typed_with_spaces_is_accepted(): void
    {
        User::factory()->withTwoFactor()->create(['username' => 'carlos']);
        [$challengeId, $code] = $this->startLogin();

        $spaced = substr($code, 0, 3).' '.substr($code, 3);

        $this->postJson('/api/v1/auth/2fa/verify', ['challenge_id' => $challengeId, 'code' => $spaced])->assertOk();
    }

    public function test_wrong_code_tells_remaining_attempts(): void
    {
        User::factory()->withTwoFactor()->create(['username' => 'carlos']);
        [$challengeId, $code] = $this->startLogin();
        $wrong = $code === '000000' ? '111111' : '000000';

        $this->postJson('/api/v1/auth/2fa/verify', ['challenge_id' => $challengeId, 'code' => $wrong])
            ->assertStatus(422)
            ->assertJsonPath('errors.code.0', 'El código no es correcto. Te quedan 4 intento(s).');
    }

    public function test_challenge_is_burned_after_five_wrong_codes(): void
    {
        User::factory()->withTwoFactor()->create(['username' => 'carlos']);
        [$challengeId, $code] = $this->startLogin();
        $wrong = $code === '000000' ? '111111' : '000000';

        for ($i = 1; $i <= 4; $i++) {
            $this->postJson('/api/v1/auth/2fa/verify', ['challenge_id' => $challengeId, 'code' => $wrong])->assertJsonValidationErrors('code');
        }
        $this->postJson('/api/v1/auth/2fa/verify', ['challenge_id' => $challengeId, 'code' => $wrong])
            ->assertJsonValidationErrors('challenge_id');

        // Even the right code no longer works
        $this->postJson('/api/v1/auth/2fa/verify', ['challenge_id' => $challengeId, 'code' => $code])
            ->assertStatus(422);
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_expired_code_is_rejected(): void
    {
        User::factory()->withTwoFactor()->create(['username' => 'carlos']);
        [$challengeId, $code] = $this->startLogin();

        $this->travel(11)->minutes();

        $this->postJson('/api/v1/auth/2fa/verify', ['challenge_id' => $challengeId, 'code' => $code])
            ->assertStatus(422)
            ->assertJsonValidationErrors('challenge_id');
    }

    public function test_resend_waits_one_minute_and_replaces_the_old_code(): void
    {
        User::factory()->withTwoFactor()->create(['username' => 'carlos']);
        [$challengeId, $oldCode] = $this->startLogin();

        $this->postJson('/api/v1/auth/2fa/resend', ['challenge_id' => $challengeId])
            ->assertStatus(422)
            ->assertJsonValidationErrors('challenge_id');

        $this->travel(61)->seconds();
        Mail::fake(); // forget the first email

        $this->postJson('/api/v1/auth/2fa/resend', ['challenge_id' => $challengeId])->assertOk();
        $newCode = $this->lastCode();

        if ($newCode !== $oldCode) {
            $this->postJson('/api/v1/auth/2fa/verify', ['challenge_id' => $challengeId, 'code' => $oldCode])
                ->assertJsonValidationErrors('code');
        }
        $this->postJson('/api/v1/auth/2fa/verify', ['challenge_id' => $challengeId, 'code' => $newCode])->assertOk();
    }

    public function test_new_login_replaces_the_previous_pending_challenge(): void
    {
        User::factory()->withTwoFactor()->create(['username' => 'carlos']);
        [$first] = $this->startLogin();
        Mail::fake();
        $this->startLogin();

        $this->assertSame(1, TwoFactorChallenge::count());
        $this->postJson('/api/v1/auth/2fa/verify', ['challenge_id' => $first, 'code' => '123456'])
            ->assertJsonValidationErrors('challenge_id');
    }

    public function test_user_deactivated_between_steps_cannot_finish_login(): void
    {
        $user = User::factory()->withTwoFactor()->create(['username' => 'carlos']);
        [$challengeId, $code] = $this->startLogin();
        $user->update(['is_active' => false]);

        $this->postJson('/api/v1/auth/2fa/verify', ['challenge_id' => $challengeId, 'code' => $code])
            ->assertStatus(422);
    }

    public function test_mfa_can_be_turned_off_globally_by_the_admin(): void
    {
        User::factory()->withTwoFactor()->create(['username' => 'carlos']);
        DB::table('settings')->where('key', 'staff_mfa_enabled')->update(['value' => '0']);

        $this->postJson('/api/v1/auth/login', ['login' => 'carlos', 'password' => 'Password123'])
            ->assertOk()
            ->assertJsonPath('mfa_required', false)
            ->assertJsonStructure(['token']);
    }

    public function test_mail_failure_returns_503_and_is_logged(): void
    {
        $user = User::factory()->withTwoFactor()->create(['username' => 'carlos']);
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('SMTP caído'));

        $this->postJson('/api/v1/auth/login', ['login' => 'carlos', 'password' => 'Password123'])
            ->assertStatus(503)
            ->assertJsonPath('code', 'MAIL_FAILED');

        $this->assertDatabaseHas('sent_emails', ['user_id' => $user->id, 'status' => 'failed']);
    }

    public function test_email_contains_the_code(): void
    {
        $html = (new TwoFactorCodeMail('Carlos', '482913', 10))->render();

        $this->assertStringContainsString('482913', $html);
        $this->assertStringContainsString('10 minutos', $html);
    }
}
