<?php

namespace Tests\Feature\Workshop;

use App\Models\Customer;
use App\Models\OrderStatus;
use App\Models\Sale;
use App\Models\ServiceOrder;
use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * C8 Clientes: lista completa con su resumen, historial de equipos y compras, y edición.
 */
class CustomerDirectoryTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    private User $cajera;

    private Customer $ana;

    protected function setUp(): void
    {
        parent::setUp();

        $this->cajera = User::factory()->cashier()->create();
        $this->ana = Customer::factory()->create(['name' => 'Ana', 'last_name' => 'López', 'phone' => '8711112222', 'email' => 'ana@correo.com']);
        Customer::factory()->create(['name' => 'Beto', 'phone' => '8713334444', 'email' => 'beto@correo.com']);

        $device = $this->ana->devices()->create(['type' => 'Celular', 'brand' => 'Samsung', 'model' => 'A54']);
        ServiceOrder::create([
            'folio' => 'OS-TEST-00001', 'customer_id' => $this->ana->id, 'device_id' => $device->id,
            'status_id' => OrderStatus::idFor(OrderStatus::READY_FOR_PICKUP), 'reported_issue' => 'No enciende.',
            'received_by' => $this->cajera->id, 'labor_cost' => 580, 'parts_cost' => 720,
        ]);
        Sale::create([
            'folio' => 'V-TEST-00001', 'cashier_id' => $this->cajera->id, 'customer_id' => $this->ana->id,
            'subtotal' => 258.62, 'discount' => 0, 'tax' => 41.38, 'status' => 'paid', 'paid_at' => now(),
        ]);
    }

    private function as(string $method, string $uri, array $data = []): TestResponse
    {
        return $this->withToken($this->cajera->createToken('Caja', ['staff'])->plainTextToken)->json($method, $uri, $data);
    }

    public function test_list_without_search_brings_every_customer_with_summary(): void
    {
        $response = $this->as('GET', '/api/v1/customers')->assertOk()->assertJsonCount(2, 'data');

        $ana = collect($response->json('data'))->firstWhere('email', 'ana@correo.com');
        $this->assertSame(['ready_for_pickup'], $ana['summary']['active_orders']);
        $this->assertEquals(300, $ana['summary']['total_spent']);
        $this->assertSame(1, $ana['summary']['visits']);
        $this->assertNotNull($ana['summary']['last_visit']);

        // La búsqueda sigue funcionando
        $this->as('GET', '/api/v1/customers?search=beto')->assertJsonCount(1, 'data');
    }

    public function test_detail_includes_history_of_devices_and_purchases(): void
    {
        $this->as('GET', "/api/v1/customers/{$this->ana->id}")
            ->assertOk()
            ->assertJsonPath('history.orders.0.folio', 'OS-TEST-00001')
            ->assertJsonPath('history.orders.0.device', 'Celular Samsung A54')
            ->assertJsonPath('history.orders.0.total', 1300)
            ->assertJsonPath('history.orders.0.status.code', 'ready_for_pickup')
            ->assertJsonPath('history.sales.0.folio', 'V-TEST-00001');
    }

    public function test_cashier_edits_a_customer(): void
    {
        $this->as('PUT', "/api/v1/customers/{$this->ana->id}", ['phone' => '871 999 0000', 'city' => 'Torreón'])
            ->assertOk()
            ->assertJsonPath('data.phone', '8719990000')
            ->assertJsonPath('data.city', 'Torreón');

        // El teléfono y el correo siguen siendo únicos
        $this->as('PUT', "/api/v1/customers/{$this->ana->id}", ['email' => 'BETO@correo.com'])
            ->assertUnprocessable()->assertJsonValidationErrors('email');

        $this->assertDatabaseHas('audit_logs', ['module' => 'customers', 'action' => 'updated', 'record_id' => $this->ana->id]);
    }
}
