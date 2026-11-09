<?php

namespace Tests\Feature\Auth;

use App\Models\Customer;
use App\Models\RoleSubstitution;
use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * RBAC (RF-01) and separation between staff and customer tokens.
 */
class AccessControlTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    protected function setUp(): void
    {
        parent::setUp();

        // Stand-ins for real module routes
        Route::middleware(['api', 'auth:sanctum', 'actor:staff', 'password.changed', 'permission:pos.sell'])
            ->post('/api/v1/_test/sales', fn () => ['ok' => true]);
        Route::middleware(['api', 'auth:sanctum', 'actor:staff', 'password.changed', 'permission:orders.assign'])
            ->post('/api/v1/_test/assign', fn () => ['ok' => true]);
    }

    private function tokenFor(User|Customer $account, string $ability): string
    {
        return $account->createToken('test', [$ability])->plainTextToken;
    }

    public function test_technician_cannot_use_the_point_of_sale(): void
    {
        $technician = User::factory()->technician()->create();

        $this->withToken($this->tokenFor($technician, 'staff'))->postJson('/api/v1/_test/sales')
            ->assertStatus(403)
            ->assertJsonPath('code', 'FORBIDDEN');
    }

    public function test_cashier_can_use_the_point_of_sale(): void
    {
        $cashier = User::factory()->cashier()->create();

        $this->withToken($this->tokenFor($cashier, 'staff'))->postJson('/api/v1/_test/sales')->assertOk();
    }

    public function test_active_role_substitution_grants_the_covered_role_permissions(): void
    {
        $admin = User::factory()->admin()->create();
        $technician = User::factory()->technician()->create();
        $token = $this->tokenFor($technician, 'staff');

        $this->withToken($token)->postJson('/api/v1/_test/assign')->assertStatus(403);

        RoleSubstitution::create([
            'user_id' => $technician->id,
            'role_id' => 2, // head_technician
            'reason' => 'Vacaciones del jefe',
            'starts_at' => now()->subHour(),
            'ends_at' => now()->addDay(),
            'assigned_by' => $admin->id,
        ]);

        // A real new HTTP request resolves the user again; simulate that here
        $this->app['auth']->forgetGuards();

        $this->withToken($token)->postJson('/api/v1/_test/assign')->assertOk();
    }

    public function test_customer_token_cannot_reach_staff_routes(): void
    {
        $customer = Customer::factory()->create();

        $this->withToken($this->tokenFor($customer, 'customer'))->getJson('/api/v1/auth/me')
            ->assertStatus(403)
            ->assertJsonPath('code', 'WRONG_ACCOUNT_TYPE');
    }

    public function test_staff_token_cannot_reach_portal_routes(): void
    {
        $user = User::factory()->admin()->create();

        $this->withToken($this->tokenFor($user, 'staff'))->getJson('/api/v1/portal/me')
            ->assertStatus(403)
            ->assertJsonPath('code', 'WRONG_ACCOUNT_TYPE');
    }

    public function test_unknown_api_route_returns_json_404(): void
    {
        $this->get('/api/v1/no-existe')
            ->assertStatus(404)
            ->assertJsonPath('code', 'NOT_FOUND');
    }
}
