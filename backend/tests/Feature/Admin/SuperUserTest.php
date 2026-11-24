<?php

namespace Tests\Feature\Admin;

use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Super usuario: por encima del administrador, con acceso total. Solo existe una cuenta
 * (se crea por consola) y ningún administrador puede verla ni modificarla.
 */
class SuperUserTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    private User $super;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();
        $this->super = User::factory()->superUser()->create(['username' => 'brisa']);
        $this->admin = User::factory()->admin()->create();
    }

    private function as(User $user, string $method, string $uri, array $data = []): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($user->createToken('PC', ['staff'])->plainTextToken)->json($method, $uri, $data);
    }

    public function test_super_user_has_every_permission_including_the_technician_ones(): void
    {
        $this->as($this->super, 'GET', '/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.role.slug', 'super_admin')
            ->assertJsonFragment(['orders.repair'])
            ->assertJsonFragment(['parts.request'])
            ->assertJsonFragment(['users.manage']);

        // Pantallas de otros roles: banco del técnico y punto de venta
        $this->as($this->super, 'GET', '/api/v1/my/orders')->assertOk();
        $this->as($this->super, 'GET', '/api/v1/users')->assertOk();
    }

    public function test_super_user_creates_staff_including_administrators(): void
    {
        foreach ([1 => 'nuevo.admin', 2 => 'nuevo.jefe', 3 => 'nuevo.tecnico', 4 => 'nueva.cajera'] as $roleId => $username) {
            $this->as($this->super, 'POST', '/api/v1/users', [
                'name' => 'Persona '.$roleId, 'username' => $username, 'email' => "{$username}@shuri.test", 'role_id' => $roleId,
            ])->assertCreated();
        }

        $this->assertDatabaseHas('users', ['username' => 'nuevo.admin', 'role_id' => 1]);
    }

    public function test_nobody_can_assign_the_super_user_role_from_the_users_screen(): void
    {
        foreach ([$this->admin, $this->super] as $actor) {
            $this->as($actor, 'POST', '/api/v1/users', [
                'name' => 'Otro Super', 'username' => 'otro.super', 'email' => 'otro@shuri.test', 'role_id' => 5,
            ])->assertUnprocessable()->assertJsonValidationErrors('role_id');
        }

        $tecnico = User::factory()->technician()->create();
        $this->as($this->admin, 'PUT', "/api/v1/users/{$tecnico->id}", ['role_id' => 5])
            ->assertUnprocessable()->assertJsonValidationErrors('role_id');

        $this->assertSame(1, User::where('role_id', 5)->count());
    }

    public function test_admin_cannot_see_or_touch_the_super_user(): void
    {
        $id = $this->super->id;

        $usernames = collect($this->as($this->admin, 'GET', '/api/v1/users?per_page=100')->assertOk()->json('data'))->pluck('username');
        $this->assertNotContains('brisa', $usernames);

        $this->as($this->admin, 'GET', "/api/v1/users/{$id}")->assertNotFound();
        $this->as($this->admin, 'PUT', "/api/v1/users/{$id}", ['name' => 'Otro'])->assertNotFound();
        $this->as($this->admin, 'POST', "/api/v1/users/{$id}/deactivate")->assertNotFound();
        $this->as($this->admin, 'POST', "/api/v1/users/{$id}/temporary-password")->assertNotFound();
        $this->as($this->admin, 'POST', "/api/v1/users/{$id}/unlock")->assertNotFound();
        $this->as($this->admin, 'GET', "/api/v1/users/{$id}/sessions")->assertNotFound();

        $this->assertTrue($this->super->fresh()->is_active);

        // Tampoco ve el rol en la matriz de permisos
        $slugs = collect($this->as($this->admin, 'GET', '/api/v1/roles')->json('data'))->pluck('slug');
        $this->assertNotContains('super_admin', $slugs);
    }

    public function test_super_user_sees_herself_and_the_role(): void
    {
        $usernames = collect($this->as($this->super, 'GET', '/api/v1/users?per_page=100')->json('data'))->pluck('username');
        $this->assertContains('brisa', $usernames);

        $slugs = collect($this->as($this->super, 'GET', '/api/v1/roles')->json('data'))->pluck('slug');
        $this->assertContains('super_admin', $slugs);
    }

    public function test_super_user_is_locked_for_15_minutes_not_until_an_admin_unlocks(): void
    {
        foreach (range(1, 3) as $_) {
            $this->postJson('/api/v1/auth/login', ['login' => 'brisa', 'password' => 'Incorrecta1']);
        }

        $lockedUntil = $this->super->fresh()->locked_until;
        $this->assertNotNull($lockedUntil);
        $this->assertTrue($lockedUntil->between(now()->addMinutes(14), now()->addMinutes(16)));
    }

    public function test_reset_command_returns_the_super_user_to_first_login(): void
    {
        $this->super->forceFill(['must_change_password' => false, 'security_question' => 'first_pet', 'security_answer_hash' => 'x', 'failed_attempts' => 3, 'locked_until' => now()->addMinutes(10)])->save();
        $this->super->createToken('PC', ['staff']);

        $this->artisan('shuri:reset-superuser', ['--force' => true])
            ->expectsOutputToContain('vuelve a su primer ingreso')
            ->assertSuccessful();

        $super = $this->super->fresh();
        $this->assertTrue($super->must_change_password);
        $this->assertNull($super->security_question);
        $this->assertNull($super->locked_until);
        $this->assertSame(0, $super->tokens()->count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'super_user_reset', 'record_id' => $super->id]);
    }

    public function test_console_command_creates_the_only_super_user(): void
    {
        $this->super->delete();

        $this->artisan('shuri:create-superuser', ['username' => 'Brisa.Luna', 'email' => 'brisa@shuri.test', 'name' => 'Brisa Luna'])
            ->expectsOutputToContain('Super usuario brisa.luna creado.')
            ->assertSuccessful();

        $this->assertDatabaseHas('users', ['username' => 'brisa.luna', 'role_id' => 5, 'must_change_password' => true]);

        $this->artisan('shuri:create-superuser', ['username' => 'otra', 'email' => 'otra@shuri.test', 'name' => 'Otra'])
            ->expectsOutputToContain('Solo puede haber uno.')
            ->assertFailed();
    }
}
