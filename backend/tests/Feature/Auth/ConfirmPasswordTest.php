<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Desbloquear la pantalla tras 30 min sin uso: confirma la contraseña sin abrir otra sesión.
 */
class ConfirmPasswordTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    public function test_correct_password_unlocks_without_creating_a_session(): void
    {
        $user = User::factory()->cashier()->create(['cash_register_id' => 1]);
        $token = $user->createToken('Caja', ['staff'])->plainTextToken;

        // La fábrica de usuarios crea la contraseña Password123
        $this->withToken($token)->postJson('/api/v1/auth/confirm-password', ['password' => 'Password123'])
            ->assertOk()
            ->assertJsonPath('message', 'Pantalla desbloqueada.');

        $this->assertSame(1, $user->tokens()->count());
    }

    public function test_wrong_password_is_rejected(): void
    {
        $user = User::factory()->cashier()->create();

        $this->withToken($user->createToken('Caja', ['staff'])->plainTextToken)
            ->postJson('/api/v1/auth/confirm-password', ['password' => 'otra'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.password.0', 'La contraseña no es correcta.');
    }

    public function test_needs_a_session(): void
    {
        $this->postJson('/api/v1/auth/confirm-password', ['password' => 'password'])->assertUnauthorized();
    }

    public function test_me_includes_the_cash_register_name(): void
    {
        $user = User::factory()->cashier()->create(['cash_register_id' => 1]);

        $this->withToken($user->createToken('Caja', ['staff'])->plainTextToken)
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.cash_register.id', 1)
            ->assertJsonPath('data.cash_register.name', 'Caja 01');
    }
}
