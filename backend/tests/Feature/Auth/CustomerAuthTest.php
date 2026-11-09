<?php

namespace Tests\Feature\Auth;

use App\Models\Customer;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Customer portal access (RF-06, screen P1).
 */
class CustomerAuthTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    public function test_customer_logs_in_with_temporary_password_and_must_change_it(): void
    {
        Customer::factory()->withTemporaryPassword()->create(['email' => 'ana@correo.com']);

        $this->postJson('/api/v1/portal/login', ['email' => 'ANA@correo.com ', 'password' => 'Password123'])
            ->assertOk()
            ->assertJsonPath('customer.must_change_password', true)
            ->assertJsonMissingPath('customer.password');

        $this->assertDatabaseHas('audit_logs', ['module' => 'portal', 'action' => 'login', 'user_id' => null]);
    }

    public function test_expired_temporary_password_is_rejected_without_issuing_a_token(): void
    {
        Customer::factory()->withTemporaryPassword(now()->subHour())->create(['email' => 'ana@correo.com']);

        $this->postJson('/api/v1/portal/login', ['email' => 'ana@correo.com', 'password' => 'Password123'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('password');

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_customer_creates_own_password_on_first_access(): void
    {
        $customer = Customer::factory()->withTemporaryPassword()->create();
        $token = $customer->createToken('celular', ['customer'])->plainTextToken;

        $this->withToken($token)->putJson('/api/v1/portal/password', [
            'current_password' => 'Password123',
            'password' => 'MiClave2026',
            'password_confirmation' => 'MiClave2026',
        ])->assertOk();

        $customer->refresh();
        $this->assertFalse($customer->must_change_password);
        $this->assertNotNull($customer->password_changed_at);
        $this->assertNull($customer->temporary_password_expires_at);
    }

    public function test_customer_wrong_password_is_counted(): void
    {
        $customer = Customer::factory()->create(['email' => 'ana@correo.com']);

        $this->postJson('/api/v1/portal/login', ['email' => 'ana@correo.com', 'password' => 'Incorrecta1'])
            ->assertStatus(422);

        $this->assertSame(1, $customer->fresh()->failed_attempts);
    }
}
