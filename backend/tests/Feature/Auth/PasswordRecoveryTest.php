<?php

namespace Tests\Feature\Auth;

use App\Mail\PasswordChangedMail;
use App\Mail\PasswordResetMail;
use App\Models\Customer;
use App\Models\User;
use App\Support\SecurityQuestions;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Password recovery with two methods: email link + security question.
 */
class PasswordRecoveryTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    private const NEW_PASSWORD = 'NuevaClave2026';

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();
        $this->withoutMiddleware(ThrottleRequests::class);
    }

    /** Requests the link and returns the token that arrived by email. */
    private function requestLink(string $email, string $prefix = 'auth'): string
    {
        $this->postJson("/api/v1/{$prefix}/password/forgot", ['email' => $email])->assertOk();

        $url = null;
        Mail::assertSent(PasswordResetMail::class, function (PasswordResetMail $mail) use (&$url) {
            $url = $mail->url;

            return true;
        });
        parse_str(parse_url($url, PHP_URL_QUERY), $query);

        return $query['token'];
    }

    private function staffWithQuestion(array $attributes = []): User
    {
        return User::factory()->create($attributes + [
            'email' => 'carlos@shuri.test',
            'username' => 'carlos',
            'security_question' => 'first_pet',
            'security_answer_hash' => Hash::make(SecurityQuestions::normalize('Firulais')),
        ]);
    }

    private function reset(string $token, ?string $answer, string $email = 'carlos@shuri.test', string $prefix = 'auth')
    {
        return $this->postJson("/api/v1/{$prefix}/password/reset", [
            'email' => $email,
            'token' => $token,
            'answer' => $answer,
            'password' => self::NEW_PASSWORD,
            'password_confirmation' => self::NEW_PASSWORD,
        ]);
    }

    public function test_unknown_email_gets_the_same_answer_and_no_email(): void
    {
        $this->postJson('/api/v1/auth/password/forgot', ['email' => 'nadie@shuri.test'])
            ->assertOk()
            ->assertJsonPath('message', 'Si el correo está registrado, te enviamos un enlace para crear una nueva contraseña.');

        Mail::assertNothingSent();
    }

    public function test_link_is_emailed_and_only_its_hash_is_stored(): void
    {
        $user = $this->staffWithQuestion();

        $token = $this->requestLink('carlos@shuri.test');

        Mail::assertSent(PasswordResetMail::class, fn ($mail) => $mail->hasTo('carlos@shuri.test')
            && str_starts_with($mail->url, 'http://localhost:4200/recuperar-contrasena?'));
        $this->assertSame(hash('sha256', $token), DB::table('password_reset_tokens')->value('token'));
        $this->assertDatabaseHas('sent_emails', ['user_id' => $user->id, 'type' => 'password_recovery', 'status' => 'sent']);
    }

    public function test_opening_the_link_shows_the_security_question(): void
    {
        $this->staffWithQuestion();
        $token = $this->requestLink('carlos@shuri.test');

        $this->postJson('/api/v1/auth/password/verify-token', ['email' => 'carlos@shuri.test', 'token' => $token])
            ->assertOk()
            ->assertJsonPath('requires_answer', true)
            ->assertJsonPath('security_question', '¿Cómo se llamaba tu primera mascota?');
    }

    public function test_invalid_token_is_rejected(): void
    {
        $this->staffWithQuestion();
        $this->requestLink('carlos@shuri.test');

        $this->postJson('/api/v1/auth/password/verify-token', ['email' => 'carlos@shuri.test', 'token' => str_repeat('a', 64)])
            ->assertStatus(422)
            ->assertJsonValidationErrors('token');
    }

    public function test_reset_with_link_and_correct_answer_changes_password_and_closes_sessions(): void
    {
        $user = $this->staffWithQuestion(['locked_until' => now()->addMinutes(10), 'failed_attempts' => 3]);
        $user->createToken('Celular robado', ['staff']);
        $token = $this->requestLink('carlos@shuri.test');

        // Accents, case and extra spaces do not matter
        $this->reset($token, '  FIRULAÍS ')->assertOk();

        $user->refresh();
        $this->assertTrue(Hash::check(self::NEW_PASSWORD, $user->password));
        $this->assertNull($user->locked_until);
        $this->assertSame(0, $user->tokens()->count());
        $this->assertDatabaseCount('password_reset_tokens', 0);
        Mail::assertSent(PasswordChangedMail::class);

        $this->postJson('/api/v1/auth/login', ['login' => 'carlos', 'password' => self::NEW_PASSWORD])->assertOk();
    }

    public function test_link_can_only_be_used_once(): void
    {
        $this->staffWithQuestion();
        $token = $this->requestLink('carlos@shuri.test');

        $this->reset($token, 'Firulais')->assertOk();
        $this->reset($token, 'Firulais')->assertStatus(422)->assertJsonValidationErrors('token');
    }

    public function test_link_alone_is_not_enough_when_a_question_is_configured(): void
    {
        $this->staffWithQuestion();
        $token = $this->requestLink('carlos@shuri.test');

        $this->reset($token, null)->assertStatus(422)->assertJsonValidationErrors('answer');
        $this->reset($token, 'Bobby')
            ->assertStatus(422)
            ->assertJsonPath('errors.answer.0', 'La respuesta no es correcta. Te quedan 1 intento(s).');
    }

    public function test_three_wrong_answers_cancel_the_link(): void
    {
        $user = $this->staffWithQuestion();
        $token = $this->requestLink('carlos@shuri.test');

        $this->reset($token, 'Bobby')->assertJsonValidationErrors('answer');
        $this->reset($token, 'Max')->assertJsonValidationErrors('answer');
        $this->reset($token, 'Rex')->assertJsonValidationErrors('token');

        // Not even the right answer works now
        $this->reset($token, 'Firulais')->assertStatus(422);
        $this->assertTrue(Hash::check('Password123', $user->fresh()->password));
        $this->assertDatabaseHas('audit_logs', ['action' => 'password_reset_blocked', 'user_id' => $user->id]);
    }

    public function test_account_without_question_recovers_with_the_email_link(): void
    {
        $user = User::factory()->create(['email' => 'laura@shuri.test']);
        $token = $this->requestLink('laura@shuri.test');

        $this->postJson('/api/v1/auth/password/verify-token', ['email' => 'laura@shuri.test', 'token' => $token])
            ->assertJsonPath('requires_answer', false);

        $this->reset($token, null, 'laura@shuri.test')->assertOk();
        $this->assertTrue(Hash::check(self::NEW_PASSWORD, $user->fresh()->password));
    }

    public function test_expired_link_is_rejected(): void
    {
        $this->staffWithQuestion();
        $token = $this->requestLink('carlos@shuri.test');

        $this->travel(61)->minutes();

        $this->reset($token, 'Firulais')->assertStatus(422)->assertJsonValidationErrors('token');
    }

    public function test_new_request_invalidates_the_previous_link(): void
    {
        $this->staffWithQuestion();
        $old = $this->requestLink('carlos@shuri.test');

        $this->travel(61)->seconds();
        Mail::fake();
        $new = $this->requestLink('carlos@shuri.test');

        $this->reset($old, 'Firulais')->assertStatus(422)->assertJsonValidationErrors('token');
        $this->reset($new, 'Firulais')->assertOk();
    }

    public function test_repeated_requests_within_a_minute_send_only_one_email(): void
    {
        $this->staffWithQuestion();

        $this->postJson('/api/v1/auth/password/forgot', ['email' => 'carlos@shuri.test'])->assertOk();
        $this->postJson('/api/v1/auth/password/forgot', ['email' => 'carlos@shuri.test'])->assertOk();

        Mail::assertSent(PasswordResetMail::class, 1);
    }

    public function test_inactive_account_does_not_receive_a_link(): void
    {
        User::factory()->inactive()->create(['email' => 'baja@shuri.test']);

        $this->postJson('/api/v1/auth/password/forgot', ['email' => 'baja@shuri.test'])->assertOk();

        Mail::assertNothingSent();
    }

    public function test_customer_recovers_portal_password(): void
    {
        $customer = Customer::factory()->withTemporaryPassword()->create([
            'email' => 'ana@correo.com',
            'security_question' => 'birth_city',
            'security_answer_hash' => Hash::make(SecurityQuestions::normalize('Torreón')),
        ]);
        $token = $this->requestLink('ana@correo.com', 'portal');

        Mail::assertSent(PasswordResetMail::class, fn ($mail) => str_contains($mail->url, '/portal/recuperar-contrasena?'));

        $this->reset($token, 'torreon', 'ana@correo.com', 'portal')->assertOk();

        $customer->refresh();
        $this->assertTrue(Hash::check(self::NEW_PASSWORD, $customer->password));
        $this->assertFalse($customer->must_change_password);
        $this->assertNull($customer->temporary_password_expires_at);
        $this->assertDatabaseHas('customer_password_reset_tokens', ['customer_id' => $customer->id, 'question_attempts' => 0]);
        $this->assertDatabaseMissing('customer_password_reset_tokens', ['customer_id' => $customer->id, 'used_at' => null]);
    }

    public function test_staff_link_does_not_work_on_the_portal(): void
    {
        $this->staffWithQuestion();
        Customer::factory()->create(['email' => 'carlos@shuri.test']);
        $token = $this->requestLink('carlos@shuri.test');

        $this->reset($token, 'Firulais', 'carlos@shuri.test', 'portal')->assertStatus(422);
    }

    public function test_user_configures_security_question_with_current_password(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('PC', ['staff'])->plainTextToken;

        $this->withToken($token)->putJson('/api/v1/auth/security-question', [
            'current_password' => 'Incorrecta1',
            'question' => 'first_pet',
            'answer' => 'Firulais',
        ])->assertStatus(422)->assertJsonValidationErrors('current_password');

        $this->withToken($token)->putJson('/api/v1/auth/security-question', [
            'current_password' => 'Password123',
            'question' => 'first_pet',
            'answer' => 'Firulais',
        ])->assertOk();

        $user->refresh();
        $this->assertSame('first_pet', $user->security_question);
        $this->assertNotSame('firulais', $user->security_answer_hash);
        $this->assertTrue(Hash::check('firulais', $user->security_answer_hash));

        $this->withToken($token)->getJson('/api/v1/auth/me')->assertJsonPath('data.has_security_question', true);
    }

    public function test_only_catalog_questions_are_accepted(): void
    {
        $user = User::factory()->create();

        $this->withToken($user->createToken('PC', ['staff'])->plainTextToken)
            ->putJson('/api/v1/auth/security-question', [
                'current_password' => 'Password123',
                'question' => 'color_favorito',
                'answer' => 'azul',
            ])->assertStatus(422)->assertJsonValidationErrors('question');
    }

    public function test_question_catalog_is_public(): void
    {
        $this->getJson('/api/v1/security-questions')
            ->assertOk()
            ->assertJsonCount(count(SecurityQuestions::ALL), 'data')
            ->assertJsonPath('data.0.key', 'first_pet');
    }
}
