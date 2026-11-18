<?php

namespace Tests\Feature\Admin;

use App\Mail\StaffAccessMail;
use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * AD7 Usuarios y permisos (RF-01, RF-14).
 */
class UserManagementTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();
        $this->admin = User::factory()->admin()->create(['username' => 'vcastillo']);
    }

    private function as(User $user, string $method, string $uri, array $data = []): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($user->createToken('PC', ['staff'])->plainTextToken)->json($method, $uri, $data);
    }

    /** @return array<string, mixed> */
    private function newCashier(array $overrides = []): array
    {
        return $overrides + [
            'name' => 'Ana Martínez',
            'username' => 'AMartinez',
            'email' => 'AMartinez@shuri.test',
            'role_id' => 4,
            'cash_register_id' => 1,
            'phone' => '871 555 1234',
            'shift' => 'morning',
            'start_time' => '09:00',
            'end_time' => '15:00',
            'max_discount_pct' => 10,
        ];
    }

    public function test_admin_creates_an_employee_with_a_temporary_password(): void
    {
        $response = $this->as($this->admin, 'POST', '/api/v1/users', $this->newCashier())
            ->assertCreated()
            ->assertJsonPath('data.username', 'amartinez')
            ->assertJsonPath('data.email', 'amartinez@shuri.test')
            ->assertJsonPath('data.role.slug', 'cashier')
            ->assertJsonPath('data.cash_register.name', 'Caja 01')
            ->assertJsonPath('data.start_time', '09:00')
            ->assertJsonPath('data.must_change_password', true)
            ->assertJsonPath('email_sent', true)
            ->assertJsonMissingPath('data.password');

        $temporary = $response->json('temporary_password');
        $user = User::where('username', 'amartinez')->firstOrFail();
        $this->assertTrue(Hash::check($temporary, $user->password));

        Mail::assertSent(StaffAccessMail::class, fn ($mail) => $mail->hasTo('amartinez@shuri.test')
            && $mail->username === 'amartinez' && $mail->temporaryPassword === $temporary && $mail->isNewAccount);
        $this->assertDatabaseHas('audit_logs', ['action' => 'user_created', 'user_id' => $this->admin->id, 'record_id' => $user->id]);

        // Entra con la contraseña temporal y el sistema le pide crear la suya (A.5)
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/auth/login', ['login' => 'amartinez', 'password' => $temporary]);
        $this->assertTrue($user->fresh()->must_change_password);
    }

    public function test_username_and_email_must_be_unique_and_valid(): void
    {
        User::factory()->create(['username' => 'amartinez', 'email' => 'amartinez@shuri.test']);

        $this->as($this->admin, 'POST', '/api/v1/users', $this->newCashier())
            ->assertStatus(422)
            ->assertJsonValidationErrors(['username', 'email']);

        $this->as($this->admin, 'POST', '/api/v1/users', $this->newCashier(['username' => 'ana martinez', 'email' => 'otra@shuri.test']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['username' => 'El usuario solo puede tener minúsculas, números, punto, guion y guion bajo.']);
    }

    public function test_discount_above_the_cap_is_only_for_admins(): void
    {
        $this->as($this->admin, 'POST', '/api/v1/users', $this->newCashier(['max_discount_pct' => 25]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['max_discount_pct' => 'El descuento máximo no puede pasar del 20% (solo el administrador puede tener más).']);

        $this->as($this->admin, 'POST', '/api/v1/users', $this->newCashier(['role_id' => 1, 'max_discount_pct' => 100]))
            ->assertCreated();
    }

    public function test_admin_edits_role_discount_and_authorization_code_with_audit(): void
    {
        $user = User::factory()->cashier()->create(['max_discount_pct' => 5]);

        $this->as($this->admin, 'PUT', "/api/v1/users/{$user->id}", [
            'role_id' => 2,
            'max_discount_pct' => 15,
            'authorization_code' => 'Clave2026',
        ])
            ->assertOk()
            ->assertJsonPath('data.role.slug', 'head_technician')
            ->assertJsonPath('data.max_discount_pct', 15)
            ->assertJsonPath('data.has_authorization_code', true)
            ->assertJsonMissingPath('data.authorization_code');

        $this->assertTrue(Hash::check('Clave2026', $user->fresh()->authorization_code));

        $log = DB::table('audit_logs')->where('action', 'user_updated')->first();
        $this->assertSame(['role_id' => 4, 'max_discount_pct' => '5.00'], json_decode($log->old_values, true));
        $this->assertStringNotContainsString('Clave2026', $log->new_values.$log->description);
    }

    public function test_admin_cannot_change_own_role_or_deactivate_herself(): void
    {
        $this->as($this->admin, 'PUT', "/api/v1/users/{$this->admin->id}", ['role_id' => 4])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['role_id' => 'No puedes cambiar tu propio rol.']);

        $this->as($this->admin, 'POST', "/api/v1/users/{$this->admin->id}/deactivate")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['user' => 'No puedes desactivar tu propia cuenta.']);
    }

    public function test_deactivating_closes_all_sessions_immediately(): void
    {
        $user = User::factory()->technician()->create();
        $token = $user->createToken('Tablet', ['staff'])->plainTextToken;

        $this->as($this->admin, 'POST', "/api/v1/users/{$user->id}/deactivate")
            ->assertOk()
            ->assertJsonPath('data.is_active', false);

        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/v1/auth/me')->assertStatus(401);
        $this->assertDatabaseHas('audit_logs', ['action' => 'user_deactivated', 'record_id' => $user->id]);

        $this->as($this->admin, 'POST', "/api/v1/users/{$user->id}/activate")
            ->assertOk()
            ->assertJsonPath('data.is_active', true);
    }

    public function test_temporary_password_unlocks_and_closes_sessions(): void
    {
        $user = User::factory()->cashier()->create(['locked_until' => '9999-12-31 23:59:59', 'failed_attempts' => 3]);
        $user->createToken('Caja', ['staff']);

        $temporary = $this->as($this->admin, 'POST', "/api/v1/users/{$user->id}/temporary-password")
            ->assertOk()
            ->assertJsonPath('data.is_locked', false)
            ->json('temporary_password');

        $user->refresh();
        $this->assertTrue($user->must_change_password);
        $this->assertTrue(Hash::check($temporary, $user->password));
        $this->assertSame(0, $user->tokens()->count());
        Mail::assertSent(StaffAccessMail::class, fn ($mail) => ! $mail->isNewAccount);
    }

    public function test_list_filters_by_search_role_and_status(): void
    {
        User::factory()->cashier()->create(['name' => 'Ana Martínez']);
        User::factory()->technician()->create(['name' => 'Carlos Ruiz']);
        User::factory()->technician()->inactive()->create(['name' => 'Luis Peña']);

        $this->as($this->admin, 'GET', '/api/v1/users?role=technician')->assertJsonCount(2, 'data');
        $this->as($this->admin, 'GET', '/api/v1/users?role=technician&active=1')->assertJsonCount(1, 'data');
        $this->as($this->admin, 'GET', '/api/v1/users?search=Martínez')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Ana Martínez');
    }

    public function test_roles_matrix_shows_permissions_and_limits(): void
    {
        $response = $this->as($this->admin, 'GET', '/api/v1/roles')
            ->assertOk()
            ->assertJsonCount(4, 'data')
            ->assertJsonPath('data.3.slug', 'cashier');

        $discount = collect($response->json('data.3.permissions'))->firstWhere('code', 'pos.discount');
        $this->assertSame(10, (int) $discount['limit_pct']);
    }

    public function test_only_users_manage_can_administer_users(): void
    {
        $cashier = User::factory()->cashier()->create();

        $this->as($cashier, 'GET', '/api/v1/users')->assertStatus(403);
        $this->as($cashier, 'POST', '/api/v1/users', $this->newCashier())->assertStatus(403);
    }
}
