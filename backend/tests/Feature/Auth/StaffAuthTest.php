<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class StaffAuthTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    public function test_staff_can_log_in_with_username_and_receives_token_and_permissions(): void
    {
        User::factory()->cashier()->create(['username' => 'sofia']);

        $response = $this->postJson('/api/v1/auth/login', [
            'login' => 'Sofia',
            'password' => 'Password123',
            'device_name' => 'Caja 1',
        ]);

        $response->assertOk()
            ->assertJsonStructure(['token', 'token_type', 'expires_at', 'user' => ['id', 'role' => ['slug'], 'permissions']])
            ->assertJsonPath('user.role.slug', 'cashier')
            ->assertJsonMissingPath('user.password');

        $this->assertContains('pos.sell', $response->json('user.permissions'));
        $this->assertDatabaseHas('personal_access_tokens', ['name' => 'Caja 1']);
        $this->assertDatabaseHas('audit_logs', ['module' => 'auth', 'action' => 'login']);
    }

    public function test_staff_can_log_in_with_email(): void
    {
        User::factory()->admin()->create(['email' => 'admin@shuri.test']);

        $this->postJson('/api/v1/auth/login', ['login' => 'admin@shuri.test', 'password' => 'Password123'])
            ->assertOk();
    }

    public function test_wrong_password_returns_generic_message_and_counts_the_attempt(): void
    {
        $user = User::factory()->create(['username' => 'carlos']);

        $this->postJson('/api/v1/auth/login', ['login' => 'carlos', 'password' => 'Incorrecta1'])
            ->assertStatus(422)
            ->assertJsonPath('errors.login.0', 'Usuario o contraseña incorrectos.');

        $this->assertSame(1, $user->fresh()->failed_attempts);
    }

    public function test_unknown_user_gets_the_same_generic_message(): void
    {
        $this->postJson('/api/v1/auth/login', ['login' => 'nadie', 'password' => 'Password123'])
            ->assertStatus(422)
            ->assertJsonPath('errors.login.0', 'Usuario o contraseña incorrectos.');
    }

    public function test_account_is_locked_after_three_failed_attempts_until_the_admin_unlocks_it(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $user = User::factory()->create(['username' => 'carlos']);

        $this->postJson('/api/v1/auth/login', ['login' => 'carlos', 'password' => 'Incorrecta1'])->assertStatus(422);
        $this->postJson('/api/v1/auth/login', ['login' => 'carlos', 'password' => 'Incorrecta1'])->assertStatus(422);

        $this->postJson('/api/v1/auth/login', ['login' => 'carlos', 'password' => 'Incorrecta1'])
            ->assertStatus(423)
            ->assertJsonPath('code', 'ACCOUNT_LOCKED')
            ->assertJsonPath('unlock', 'admin')
            ->assertJsonPath('message', 'Tu cuenta está bloqueada por seguridad. Pide al administrador que la desbloquee.');

        // El tiempo no la desbloquea; incluso la contraseña correcta se rechaza
        $this->travel(1)->days();
        $this->postJson('/api/v1/auth/login', ['login' => 'carlos', 'password' => 'Password123'])
            ->assertStatus(423);

        $this->assertDatabaseHas('audit_logs', ['action' => 'login_locked', 'user_id' => $user->id]);
    }

    public function test_admin_unlocks_a_locked_account(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $admin = User::factory()->admin()->create();
        $user = User::factory()->create(['username' => 'carlos', 'locked_until' => '9999-12-31 23:59:59']);

        $this->withToken($admin->createToken('PC', ['staff'])->plainTextToken)
            ->postJson("/api/v1/users/{$user->id}/unlock")
            ->assertOk();

        $this->assertNull($user->fresh()->locked_until);
        $this->assertDatabaseHas('audit_logs', ['action' => 'account_unlocked', 'user_id' => $admin->id, 'record_id' => $user->id]);

        $this->postJson('/api/v1/auth/login', ['login' => 'carlos', 'password' => 'Password123'])->assertOk();
    }

    public function test_only_users_with_users_manage_permission_can_unlock(): void
    {
        $cashier = User::factory()->cashier()->create();
        $user = User::factory()->create(['locked_until' => '9999-12-31 23:59:59']);

        $this->withToken($cashier->createToken('Caja', ['staff'])->plainTextToken)
            ->postJson("/api/v1/users/{$user->id}/unlock")
            ->assertStatus(403);

        $this->assertNotNull($user->fresh()->locked_until);
    }

    public function test_timed_lock_can_be_turned_back_on_in_settings(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        DB::table('settings')->where('key', 'staff_lock_minutes')->update(['value' => '15']);
        User::factory()->create(['username' => 'carlos']);

        for ($i = 1; $i <= 2; $i++) {
            $this->postJson('/api/v1/auth/login', ['login' => 'carlos', 'password' => 'Incorrecta1']);
        }

        $this->postJson('/api/v1/auth/login', ['login' => 'carlos', 'password' => 'Incorrecta1'])
            ->assertStatus(423)
            ->assertJsonPath('unlock', 'time')
            ->assertJsonPath('retry_after_minutes', 15);
    }

    public function test_lock_expires_and_user_can_log_in_again(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        User::factory()->create(['username' => 'carlos', 'locked_until' => now()->subMinute()]);

        $this->postJson('/api/v1/auth/login', ['login' => 'carlos', 'password' => 'Password123'])->assertOk();
    }

    public function test_login_endpoint_is_rate_limited(): void
    {
        for ($i = 1; $i <= 5; $i++) {
            $this->postJson('/api/v1/auth/login', ['login' => 'nadie', 'password' => 'x']);
        }

        $this->postJson('/api/v1/auth/login', ['login' => 'nadie', 'password' => 'x'])
            ->assertStatus(429)
            ->assertJsonPath('code', 'TOO_MANY_REQUESTS');
    }

    public function test_inactive_user_cannot_log_in(): void
    {
        User::factory()->inactive()->create(['username' => 'baja']);

        $this->postJson('/api/v1/auth/login', ['login' => 'baja', 'password' => 'Password123'])
            ->assertStatus(422);
    }

    public function test_login_validates_required_fields_in_spanish(): void
    {
        $this->postJson('/api/v1/auth/login', [])
            ->assertStatus(422)
            ->assertJsonPath('errors.password.0', 'El campo contraseña es obligatorio.');
    }

    public function test_me_requires_a_token(): void
    {
        $this->getJson('/api/v1/auth/me')
            ->assertStatus(401)
            ->assertJsonPath('code', 'UNAUTHENTICATED');
    }

    public function test_me_returns_the_authenticated_user(): void
    {
        $user = User::factory()->headTechnician()->create();
        $token = $user->createToken('test', ['staff'])->plainTextToken;

        $this->withToken($token)->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.id', $user->id)
            ->assertJsonPath('data.role.slug', 'head_technician');
    }

    public function test_logout_revokes_the_current_token(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test', ['staff'])->plainTextToken;

        $this->withToken($token)->postJson('/api/v1/auth/logout')->assertOk();

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_expired_token_is_rejected(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test', ['staff'], now()->subMinute())->plainTextToken;

        $this->withToken($token)->getJson('/api/v1/auth/me')->assertStatus(401);
    }

    public function test_deactivated_user_loses_access_immediately(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test', ['staff'])->plainTextToken;
        $user->update(['is_active' => false]);

        $this->withToken($token)->getJson('/api/v1/auth/me')
            ->assertStatus(401)
            ->assertJsonPath('code', 'ACCOUNT_INACTIVE');
    }
}
