<?php

namespace Tests\Feature\Auth;

use App\Models\Customer;
use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Multisesión: listar sesiones activas, cerrar sesiones a distancia y control de dispositivos (AD7).
 */
class SessionTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    private const CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

    /** Cada llamada se comporta como una petición HTTP nueva con su propio token. */
    private function as(string $token, string $method, string $uri): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($token)->json($method, $uri);
    }

    public function test_login_records_ip_and_device_of_the_session(): void
    {
        User::factory()->create(['username' => 'carlos']);

        $this->withHeader('User-Agent', self::CHROME_WINDOWS)
            ->postJson('/api/v1/auth/login', ['login' => 'carlos', 'password' => 'Password123', 'device_name' => 'PC Taller'])
            ->assertOk();

        $this->assertDatabaseHas('personal_access_tokens', [
            'name' => 'PC Taller',
            'ip_address' => '127.0.0.1',
            'user_agent' => self::CHROME_WINDOWS,
        ]);
    }

    public function test_user_lists_only_own_active_sessions_and_sees_which_is_current(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $current = $user->createToken('PC Mostrador', ['staff'])->plainTextToken;
        $user->createToken('Celular', ['staff']);
        $user->createToken('Vencida', ['staff'], now()->subMinute());
        $other->createToken('Ajena', ['staff']);

        $response = $this->as($current, 'GET', '/api/v1/auth/sessions')->assertOk();

        $names = collect($response->json('data'))->pluck('device_name')->sort()->values()->all();
        $this->assertSame(['Celular', 'PC Mostrador'], $names);

        $currentRow = collect($response->json('data'))->firstWhere('is_current', true);
        $this->assertSame('PC Mostrador', $currentRow['device_name']);
        $this->assertArrayNotHasKey('token', $currentRow);
    }

    public function test_user_closes_a_session_on_another_device(): void
    {
        $user = User::factory()->create();
        $current = $user->createToken('PC', ['staff'])->plainTextToken;
        $phone = $user->createToken('Celular', ['staff']);

        $this->as($current, 'DELETE', "/api/v1/auth/sessions/{$phone->accessToken->id}")->assertOk();

        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $phone->accessToken->id]);
        $this->as($phone->plainTextToken, 'GET', '/api/v1/auth/me')->assertStatus(401);
        $this->assertDatabaseHas('audit_logs', ['action' => 'session_revoked', 'user_id' => $user->id]);
    }

    public function test_user_cannot_close_someone_elses_session(): void
    {
        $user = User::factory()->create();
        $victim = User::factory()->create();
        $token = $user->createToken('PC', ['staff'])->plainTextToken;
        $victimToken = $victim->createToken('PC', ['staff']);

        $this->as($token, 'DELETE', "/api/v1/auth/sessions/{$victimToken->accessToken->id}")
            ->assertStatus(404);

        $this->assertDatabaseHas('personal_access_tokens', ['id' => $victimToken->accessToken->id]);
    }

    public function test_close_all_other_sessions_keeps_the_current_one(): void
    {
        $user = User::factory()->create();
        $current = $user->createToken('PC', ['staff'])->plainTextToken;
        $user->createToken('Celular', ['staff']);
        $user->createToken('Tablet', ['staff']);

        $this->as($current, 'DELETE', '/api/v1/auth/sessions')
            ->assertOk()
            ->assertJsonPath('closed', 2);

        $this->assertSame(['PC'], $user->tokens()->pluck('name')->all());
    }

    public function test_customer_manages_own_portal_sessions(): void
    {
        $customer = Customer::factory()->create();
        $current = $customer->createToken('iPhone', ['customer'])->plainTextToken;
        $other = $customer->createToken('Laptop', ['customer']);

        $this->as($current, 'GET', '/api/v1/portal/sessions')->assertOk()->assertJsonCount(2, 'data');

        $this->as($current, 'DELETE', "/api/v1/portal/sessions/{$other->accessToken->id}")->assertOk();

        $this->assertSame(1, $customer->tokens()->count());
    }

    public function test_customer_cannot_close_a_staff_session_with_the_same_id_space(): void
    {
        $staff = User::factory()->create();
        $staffToken = $staff->createToken('PC', ['staff']);
        $customer = Customer::factory()->create();
        $token = $customer->createToken('iPhone', ['customer'])->plainTextToken;

        $this->as($token, 'DELETE', "/api/v1/portal/sessions/{$staffToken->accessToken->id}")->assertStatus(404);

        $this->assertDatabaseHas('personal_access_tokens', ['id' => $staffToken->accessToken->id]);
    }

    public function test_admin_sees_and_closes_all_sessions_of_a_staff_member(): void
    {
        $admin = User::factory()->admin()->create();
        $cashier = User::factory()->cashier()->create();
        $adminToken = $admin->createToken('PC Admin', ['staff'])->plainTextToken;
        $lostPhone = $cashier->createToken('Celular perdido', ['staff'])->plainTextToken;
        $cashier->createToken('Caja 1', ['staff']);

        $this->as($adminToken, 'GET', "/api/v1/users/{$cashier->id}/sessions")
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $this->as($adminToken, 'DELETE', "/api/v1/users/{$cashier->id}/sessions")
            ->assertOk()
            ->assertJsonPath('closed', 2);

        $this->as($lostPhone, 'GET', '/api/v1/auth/me')->assertStatus(401);
        $this->assertDatabaseHas('audit_logs', ['action' => 'sessions_revoked', 'user_id' => $admin->id, 'record_id' => $cashier->id]);
    }

    public function test_cashier_cannot_manage_other_users_sessions(): void
    {
        $cashier = User::factory()->cashier()->create();
        $technician = User::factory()->technician()->create();
        $token = $cashier->createToken('Caja 1', ['staff'])->plainTextToken;

        $this->as($token, 'GET', "/api/v1/users/{$technician->id}/sessions")
            ->assertStatus(403)
            ->assertJsonPath('code', 'FORBIDDEN');
    }

    public function test_session_shows_readable_browser_and_platform(): void
    {
        $user = User::factory()->create(['username' => 'carlos']);

        $token = $this->withHeader('User-Agent', self::CHROME_WINDOWS)
            ->postJson('/api/v1/auth/login', ['login' => 'carlos', 'password' => 'Password123'])
            ->json('token');

        $this->as($token, 'GET', '/api/v1/auth/sessions')
            ->assertJsonPath('data.0.browser', 'Chrome')
            ->assertJsonPath('data.0.platform', 'Windows')
            ->assertJsonPath('data.0.is_current', true);
    }
}
