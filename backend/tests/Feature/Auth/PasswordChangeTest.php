<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class PasswordChangeTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    protected function setUp(): void
    {
        parent::setUp();
        Route::middleware(['api', 'auth:sanctum', 'actor:staff', 'password.changed'])
            ->get('/api/v1/_test/dashboard', fn () => ['ok' => true]);
    }

    public function test_user_with_temporary_password_is_blocked_from_operational_routes(): void
    {
        $user = User::factory()->withTemporaryPassword()->create();
        $token = $user->createToken('test', ['staff'])->plainTextToken;

        $this->withToken($token)->getJson('/api/v1/_test/dashboard')
            ->assertStatus(403)
            ->assertJsonPath('code', 'PASSWORD_CHANGE_REQUIRED');

        $this->withToken($token)->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.must_change_password', true);
    }

    public function test_changing_password_unlocks_access_and_closes_other_sessions(): void
    {
        $user = User::factory()->withTemporaryPassword()->create();
        $user->createToken('otro-dispositivo', ['staff']);
        $token = $user->createToken('este', ['staff'])->plainTextToken;

        $this->withToken($token)->putJson('/api/v1/auth/password', [
            'current_password' => 'Password123',
            'password' => 'NuevaClave2026',
            'password_confirmation' => 'NuevaClave2026',
        ])->assertOk();

        $user->refresh();
        $this->assertFalse($user->must_change_password);
        $this->assertTrue(Hash::check('NuevaClave2026', $user->password));
        $this->assertSame(['este'], $user->tokens()->pluck('name')->all());

        $this->withToken($token)->getJson('/api/v1/_test/dashboard')->assertOk();
    }

    public function test_wrong_current_password_is_rejected(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test', ['staff'])->plainTextToken;

        $this->withToken($token)->putJson('/api/v1/auth/password', [
            'current_password' => 'NoEsLaMia1',
            'password' => 'NuevaClave2026',
            'password_confirmation' => 'NuevaClave2026',
        ])->assertStatus(422)->assertJsonValidationErrors('current_password');
    }

    public function test_weak_password_is_rejected(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test', ['staff'])->plainTextToken;

        $this->withToken($token)->putJson('/api/v1/auth/password', [
            'current_password' => 'Password123',
            'password' => 'abc',
            'password_confirmation' => 'abc',
        ])->assertStatus(422)->assertJsonValidationErrors('password');
    }

    public function test_passwords_are_stored_hashed_with_bcrypt(): void
    {
        $user = User::factory()->create();

        $this->assertStringStartsWith('$2y$', $user->getRawOriginal('password'));
    }
}
