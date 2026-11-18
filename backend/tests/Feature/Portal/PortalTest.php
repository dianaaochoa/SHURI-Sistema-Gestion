<?php

namespace Tests\Feature\Portal;

use App\Models\Customer;
use App\Models\OrderStatus;
use App\Models\ServiceOrder;
use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Portal del cliente: mis equipos (P1), seguimiento (P2) e información (P4) · RF-06,
 * prioridad 4 del MVP. Incluye el recorrido completo del MVP de punta a punta.
 */
class PortalTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    private static int $folio = 0;

    private function as(User|Customer $account, string $method, string $uri, array $data = []): TestResponse
    {
        $this->app['auth']->forgetGuards();
        $ability = $account instanceof User ? 'staff' : 'customer';

        return $this->withToken($account->createToken('Celular', [$ability])->plainTextToken)->json($method, $uri, $data);
    }

    private function order(Customer $customer, string $status = OrderStatus::RECEIVED, array $attributes = []): ServiceOrder
    {
        $device = $customer->devices()->create(['type' => 'Celular', 'brand' => 'Apple', 'model' => 'iPhone 12']);

        return ServiceOrder::create($attributes + [
            'folio' => sprintf('OS-TEST-%05d', ++self::$folio),
            'customer_id' => $customer->id,
            'device_id' => $device->id,
            'status_id' => OrderStatus::idFor($status),
            'reported_issue' => 'La batería dura muy poco.',
            'device_pin' => '1234',
            'received_by' => User::factory()->cashier()->create()->id,
        ]);
    }

    public function test_full_mvp_flow_from_reception_to_the_customer_portal(): void
    {
        Mail::fake();
        $cashier = User::factory()->cashier()->create(['cash_register_id' => 1]);
        $head = User::factory()->headTechnician()->create();
        $technician = User::factory()->technician()->create(['name' => 'Carlos Ruiz']);

        // P1 · La cajera recibe el equipo de un cliente nuevo (RF-03)
        $reception = $this->as($cashier, 'POST', '/api/v1/service-orders', [
            'customer' => ['name' => 'Ana', 'phone' => '8711112222', 'email' => 'ana@correo.com'],
            'device' => ['type' => 'Celular', 'brand' => 'Apple', 'model' => 'iPhone 12'],
            'reported_issue' => 'La batería dura muy poco.',
        ])->assertCreated();
        $folio = $reception->json('data.folio');
        $temporary = $reception->json('portal_access.temporary_password');

        // P2 · El jefe asigna (RF-04) y el técnico diagnostica (RF-05)
        $this->as($head, 'POST', "/api/v1/service-orders/{$folio}/assign", ['technician_id' => $technician->id])->assertOk();
        $this->as($technician, 'POST', "/api/v1/my/orders/{$folio}/start")->assertOk();
        $this->as($technician, 'POST', "/api/v1/my/orders/{$folio}/diagnosis", [
            'outcome' => 'repairable', 'diagnosis' => 'Batería degradada al 68 %.', 'labor_level_id' => 2,
        ])->assertOk();

        // P4 · El cliente entra con su contraseña temporal, crea la suya y ve su equipo (RF-06)
        $this->app['auth']->forgetGuards();
        $token = $this->postJson('/api/v1/portal/login', ['email' => 'ana@correo.com', 'password' => $temporary])
            ->assertOk()
            ->json('token');

        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/v1/portal/orders')->assertStatus(403); // primero crea su contraseña

        $this->app['auth']->forgetGuards();
        $this->withToken($token)->putJson('/api/v1/portal/password', [
            'current_password' => $temporary, 'password' => 'MiClave2026', 'password_confirmation' => 'MiClave2026',
        ])->assertOk();

        $this->app['auth']->forgetGuards();
        $detail = $this->withToken($token)->getJson("/api/v1/portal/orders/{$folio}")
            ->assertOk()
            ->assertJsonPath('data.status.code', 'quoting')
            ->assertJsonPath('data.status.step', 2)
            ->assertJsonPath('data.technician', 'Carlos')
            ->assertJsonPath('data.steps.0.done', true)
            ->assertJsonPath('data.steps.1.current', true)
            ->json('data');

        // Línea de tiempo: recepción + cambios de estado, sin notas internas (asignación ni diagnóstico)
        $descriptions = collect($detail['timeline'])->pluck('description')->all();
        $this->assertSame([
            "Equipo recibido en sucursal con folio {$folio}.",
            'Estado cambiado a «Asignado a Técnico».',
            'Estado cambiado a «En Diagnóstico».',
            'Estado cambiado a «En Cotización».',
        ], $descriptions);
        $this->assertArrayNotHasKey('device_pin', $detail);
    }

    public function test_customer_sees_only_her_own_orders(): void
    {
        $ana = Customer::factory()->create();
        $beto = Customer::factory()->create();
        $mine = $this->order($ana);
        $this->order($beto);

        $this->as($ana, 'GET', '/api/v1/portal/orders')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.folio', $mine->folio)
            ->assertJsonPath('data.0.device', 'Celular Apple iPhone 12')
            ->assertJsonPath('data.0.status.message', 'Tu equipo ha sido ingresado correctamente en nuestras instalaciones y está en cola para evaluación.');
    }

    public function test_another_customers_folio_returns_404(): void
    {
        $ana = Customer::factory()->create();
        $other = $this->order(Customer::factory()->create());

        $this->as($ana, 'GET', "/api/v1/portal/orders/{$other->folio}")
            ->assertStatus(404)
            ->assertJsonPath('message', "No encontramos el folio {$other->folio} en tu cuenta.");
    }

    public function test_ready_order_shows_amount_due_and_pickup_step(): void
    {
        $ana = Customer::factory()->create();
        $order = $this->order($ana, OrderStatus::READY_FOR_PICKUP, ['labor_cost' => 300, 'parts_cost' => 450, 'deposit' => 300]);

        $this->as($ana, 'GET', "/api/v1/portal/orders/{$order->folio}")
            ->assertOk()
            ->assertJsonPath('data.status.step', 5)
            ->assertJsonPath('data.amount_due', 450)
            ->assertJsonPath('data.steps.4.current', true);
    }

    public function test_active_filter_hides_delivered_orders(): void
    {
        $ana = Customer::factory()->create();
        $this->order($ana);
        $this->order($ana, OrderStatus::DELIVERED, ['is_paid' => true]);

        $this->as($ana, 'GET', '/api/v1/portal/orders?active=1')->assertJsonCount(1, 'data');
        $this->as($ana, 'GET', '/api/v1/portal/orders')->assertJsonCount(2, 'data');
    }

    public function test_staff_token_cannot_use_the_portal(): void
    {
        $this->as(User::factory()->admin()->create(), 'GET', '/api/v1/portal/orders')->assertStatus(403);
    }

    public function test_branch_info_is_public(): void
    {
        $this->getJson('/api/v1/portal/info')
            ->assertOk()
            ->assertJsonPath('data.hours', 'Lun-Vie 10:00-19:00 / Sáb 10:00-14:00')
            ->assertJsonPath('data.abandonment_days', 90);
    }
}
