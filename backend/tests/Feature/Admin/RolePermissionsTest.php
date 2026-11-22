<?php

namespace Tests\Feature\Admin;

use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * AD7.3 Editar los permisos de cada rol, y el aviso de AD7 cuando un empleado
 * no pudo recuperar su contraseña en línea.
 */
class RolePermissionsTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();
        $this->admin = User::factory()->admin()->create();
    }

    private function as(User $user, string $method, string $uri, array $data = []): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($user->createToken('PC', ['staff'])->plainTextToken)->json($method, $uri, $data);
    }

    /** @return array<int, string> */
    private function codesOf(int $roleId): array
    {
        return DB::table('permission_role')->join('permissions', 'permissions.id', '=', 'permission_id')
            ->where('role_id', $roleId)->pluck('code')->sort()->values()->all();
    }

    public function test_roles_include_the_full_permission_catalog(): void
    {
        $this->as($this->admin, 'GET', '/api/v1/roles')
            ->assertOk()
            ->assertJsonFragment(['code' => 'orders.repair', 'module' => 'workshop'])
            ->assertJsonCount(DB::table('permissions')->count(), 'permissions');
    }

    public function test_admin_changes_the_cashier_permissions_keeping_limits_and_scopes(): void
    {
        $codes = array_values(array_diff($this->codesOf(4), ['pos.refund']));
        $codes[] = 'reports.view';

        $this->as($this->admin, 'PUT', '/api/v1/roles/4', ['permissions' => $codes, 'discount_limit_pct' => 15])
            ->assertOk()
            ->assertJsonPath('data.slug', 'cashier');

        $this->assertContains('reports.view', $this->codesOf(4));
        $this->assertNotContains('pos.refund', $this->codesOf(4));
        // El alcance "contra pedido" de la entrada de mercancía se conserva y el descuento cambia
        $pivot = fn (string $code) => DB::table('permission_role')->join('permissions', 'permissions.id', '=', 'permission_id')
            ->where('role_id', 4)->where('code', $code)->first();
        $this->assertSame('against_order', $pivot('inventory.stock_in')->scope);
        $this->assertEquals(15, $pivot('pos.discount')->limit_pct);
        $this->assertDatabaseHas('audit_logs', ['action' => 'role_permissions_updated', 'record_id' => 4]);

        // Un usuario de ese rol recibe los permisos nuevos
        $cajera = User::factory()->cashier()->create();
        $this->as($cajera, 'GET', '/api/v1/auth/me')->assertJsonFragment(['reports.view']);
    }

    public function test_rules_that_protect_the_matrix(): void
    {
        $sinUsuarios = array_values(array_diff($this->codesOf(1), ['users.manage']));
        $this->as($this->admin, 'PUT', '/api/v1/roles/1', ['permissions' => $sinUsuarios])
            ->assertUnprocessable()->assertJsonValidationErrors('permissions');

        $this->as($this->admin, 'PUT', '/api/v1/roles/4', ['permissions' => ['pos.sell'], 'discount_limit_pct' => 30])
            ->assertUnprocessable()->assertJsonValidationErrors('discount_limit_pct');

        $this->as($this->admin, 'PUT', '/api/v1/roles/4', ['permissions' => ['no.existe']])
            ->assertUnprocessable()->assertJsonValidationErrors('permissions.0');

        // El rol del super usuario: el administrador no lo ve; el super usuario no lo puede recortar
        $this->as($this->admin, 'PUT', '/api/v1/roles/5', ['permissions' => []])->assertNotFound();
        $this->as(User::factory()->superUser()->create(), 'PUT', '/api/v1/roles/5', ['permissions' => []])
            ->assertUnprocessable();

        $this->as(User::factory()->cashier()->create(), 'PUT', '/api/v1/roles/4', ['permissions' => []])->assertForbidden();
    }

    public function test_staff_without_security_question_appears_as_asking_for_help(): void
    {
        $tecnico = User::factory()->technician()->create(['username' => 'sinpregunta']);

        $this->postJson('/api/v1/auth/password/forgot', ['login' => 'sinpregunta'])
            ->assertOk()->assertJsonPath('requires_answer', false);

        $respuesta = $this->as($this->admin, 'GET', "/api/v1/users/{$tecnico->id}")
            ->assertJsonPath('data.has_security_question', false);
        $this->assertNotNull($respuesta->json('data.password_help_requested_at'));

        // Al asignarle una contraseña temporal, el aviso desaparece
        $this->as($this->admin, 'POST', "/api/v1/users/{$tecnico->id}/temporary-password")->assertOk();
        $this->assertNull($tecnico->fresh()->password_reset_requested_at);
        $this->as($this->admin, 'GET', "/api/v1/users/{$tecnico->id}")->assertJsonPath('data.password_help_requested_at', null);
    }
}
