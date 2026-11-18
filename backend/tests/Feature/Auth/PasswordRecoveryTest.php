<?php

namespace Tests\Feature\Auth;

use App\Mail\TemporaryPasswordMail;
use App\Models\Customer;
use App\Models\User;
use App\Support\SecurityQuestions;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Recuperación de contraseña (Figma A.3): usuario → pregunta de seguridad →
 * contraseña temporal por correo → crear contraseña (A.5).
 */
class PasswordRecoveryTest extends TestCase
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

    private function staffWithQuestion(array $attributes = []): User
    {
        return User::factory()->create($attributes + [
            'email' => 'carlos@shuri.test',
            'username' => 'carlos',
            'security_question' => 'first_pet',
            'security_answer_hash' => Hash::make(SecurityQuestions::normalize('Firulais')),
        ]);
    }

    private function forgot(string $login, string $prefix = 'auth'): TestResponse
    {
        return $this->postJson("/api/v1/{$prefix}/password/forgot", ['login' => $login]);
    }

    private function answer(string $recoveryId, string $answer, string $prefix = 'auth'): TestResponse
    {
        return $this->postJson("/api/v1/{$prefix}/password/answer", ['recovery_id' => $recoveryId, 'answer' => $answer]);
    }

    private function sentTemporaryPassword(): string
    {
        $password = null;
        Mail::assertSent(TemporaryPasswordMail::class, function (TemporaryPasswordMail $mail) use (&$password) {
            $password = $mail->temporaryPassword;

            return true;
        });

        return $password;
    }

    public function test_forgot_with_username_returns_the_security_question(): void
    {
        $this->staffWithQuestion();

        $this->forgot('Carlos')
            ->assertOk()
            ->assertJsonPath('requires_answer', true)
            ->assertJsonPath('security_question', '¿Cómo se llamaba tu primera mascota?')
            ->assertJsonStructure(['recovery_id']);

        Mail::assertNothingSent();
    }

    public function test_forgot_also_accepts_the_email(): void
    {
        $this->staffWithQuestion();

        $this->forgot('carlos@shuri.test')->assertOk()->assertJsonPath('requires_answer', true);
    }

    public function test_unknown_user_and_user_without_question_get_the_same_answer(): void
    {
        User::factory()->create(['username' => 'laura']);

        $unknown = $this->forgot('nadie')->assertOk()->json();
        $withoutQuestion = $this->forgot('laura')->assertOk()->json();

        $this->assertSame($unknown, $withoutQuestion);
        $this->assertFalse($unknown['requires_answer']);
        $this->assertArrayNotHasKey('recovery_id', $unknown);
    }

    public function test_recovery_id_is_stored_hashed(): void
    {
        $this->staffWithQuestion();
        $recoveryId = $this->forgot('carlos')->json('recovery_id');

        $this->assertSame(hash('sha256', $recoveryId), DB::table('password_reset_tokens')->value('token'));
    }

    public function test_full_flow_question_then_temporary_password_then_create_password(): void
    {
        $user = $this->staffWithQuestion(['locked_until' => now()->addMinutes(10), 'failed_attempts' => 3]);
        $user->createToken('Celular robado', ['staff']);
        $recoveryId = $this->forgot('carlos')->json('recovery_id');

        // No importan los acentos, las mayúsculas ni los espacios de más
        $this->answer($recoveryId, '  FIRULAÍS ')
            ->assertOk()
            ->assertJsonPath('email_hint', 'c*****@shuri.test');

        Mail::assertSent(TemporaryPasswordMail::class, fn ($mail) => $mail->hasTo('carlos@shuri.test') && $mail->login === 'carlos');
        $temporary = $this->sentTemporaryPassword();

        $user->refresh();
        $this->assertTrue($user->must_change_password);
        $this->assertTrue(Hash::check($temporary, $user->password));
        $this->assertNull($user->locked_until);
        $this->assertSame(0, $user->tokens()->count());
        $this->assertDatabaseHas('sent_emails', ['user_id' => $user->id, 'type' => 'temporary_password', 'status' => 'sent']);

        // Entrar con la contraseña temporal → debe crear una nueva (A.5)
        $token = $this->postJson('/api/v1/auth/login', ['login' => 'carlos', 'password' => $temporary])
            ->assertOk()
            ->assertJsonPath('user.must_change_password', true)
            ->json('token');

        $this->withToken($token)->putJson('/api/v1/auth/password', [
            'current_password' => $temporary,
            'password' => 'NuevaClave2026',
            'password_confirmation' => 'NuevaClave2026',
        ])->assertOk();

        $this->assertFalse($user->fresh()->must_change_password);
    }

    public function test_temporary_password_is_not_stored_in_plain_text(): void
    {
        $this->staffWithQuestion();
        $this->answer($this->forgot('carlos')->json('recovery_id'), 'Firulais')->assertOk();
        $temporary = $this->sentTemporaryPassword();

        $this->assertDatabaseMissing('users', ['password' => $temporary]);
        $this->assertStringStartsWith('$2y$', DB::table('users')->where('username', 'carlos')->value('password'));
    }

    public function test_wrong_answer_tells_remaining_attempts(): void
    {
        $this->staffWithQuestion();
        $recoveryId = $this->forgot('carlos')->json('recovery_id');

        $this->answer($recoveryId, 'Bobby')
            ->assertStatus(422)
            ->assertJsonPath('errors.answer.0', 'La respuesta no es correcta. Te quedan 2 intento(s).');

        Mail::assertNothingSent();
    }

    public function test_three_wrong_answers_cancel_the_recovery(): void
    {
        $user = $this->staffWithQuestion();
        $recoveryId = $this->forgot('carlos')->json('recovery_id');

        $this->answer($recoveryId, 'Bobby')->assertJsonValidationErrors('answer');
        $this->answer($recoveryId, 'Max')->assertJsonValidationErrors('answer');
        $this->answer($recoveryId, 'Rex')->assertJsonValidationErrors('recovery_id');

        // Ahora ni la respuesta correcta funciona
        $this->answer($recoveryId, 'Firulais')->assertStatus(422);
        $this->assertTrue(Hash::check('Password123', $user->fresh()->password));
        Mail::assertNothingSent();
        $this->assertDatabaseHas('audit_logs', ['action' => 'password_recovery_blocked', 'user_id' => $user->id]);
    }

    public function test_recovery_can_only_be_used_once(): void
    {
        $this->staffWithQuestion();
        $recoveryId = $this->forgot('carlos')->json('recovery_id');

        $this->answer($recoveryId, 'Firulais')->assertOk();
        $this->answer($recoveryId, 'Firulais')->assertStatus(422)->assertJsonValidationErrors('recovery_id');
    }

    public function test_recovery_expires_after_fifteen_minutes(): void
    {
        $this->staffWithQuestion();
        $recoveryId = $this->forgot('carlos')->json('recovery_id');

        $this->travel(16)->minutes();

        $this->answer($recoveryId, 'Firulais')->assertStatus(422)->assertJsonValidationErrors('recovery_id');
    }

    public function test_starting_again_invalidates_the_previous_recovery(): void
    {
        $this->staffWithQuestion();
        $old = $this->forgot('carlos')->json('recovery_id');
        $new = $this->forgot('carlos')->json('recovery_id');

        $this->answer($old, 'Firulais')->assertStatus(422);
        $this->answer($new, 'Firulais')->assertOk();
    }

    public function test_inactive_account_cannot_recover(): void
    {
        $this->staffWithQuestion(['is_active' => false]);

        $this->forgot('carlos')->assertOk()->assertJsonPath('requires_answer', false);
    }

    public function test_mail_failure_returns_503(): void
    {
        $this->staffWithQuestion();
        $recoveryId = $this->forgot('carlos')->json('recovery_id');
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('SMTP caído'));

        $this->answer($recoveryId, 'Firulais')
            ->assertStatus(503)
            ->assertJsonPath('code', 'MAIL_FAILED');
    }

    public function test_customer_recovers_portal_access_with_email(): void
    {
        $customer = Customer::factory()->create([
            'email' => 'ana@correo.com',
            'security_question' => 'birth_city',
            'security_answer_hash' => Hash::make(SecurityQuestions::normalize('Torreón')),
        ]);

        $recoveryId = $this->forgot('ANA@correo.com', 'portal')
            ->assertJsonPath('security_question', '¿En qué ciudad naciste?')
            ->json('recovery_id');

        $this->answer($recoveryId, 'torreon', 'portal')->assertOk();
        $temporary = $this->sentTemporaryPassword();

        $customer->refresh();
        $this->assertTrue($customer->must_change_password);
        $this->assertNotNull($customer->temporary_password_expires_at);
        $this->assertDatabaseMissing('customer_password_reset_tokens', ['customer_id' => $customer->id, 'used_at' => null]);

        $this->postJson('/api/v1/portal/login', ['email' => 'ana@correo.com', 'password' => $temporary])
            ->assertOk()
            ->assertJsonPath('customer.must_change_password', true);
    }

    public function test_staff_recovery_id_does_not_work_on_the_portal(): void
    {
        $this->staffWithQuestion();
        $recoveryId = $this->forgot('carlos')->json('recovery_id');

        $this->answer($recoveryId, 'Firulais', 'portal')->assertStatus(422);
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
