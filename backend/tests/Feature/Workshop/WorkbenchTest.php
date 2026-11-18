<?php

namespace Tests\Feature\Workshop;

use App\Models\Customer;
use App\Models\OrderStatus;
use App\Models\OrderTimeLog;
use App\Models\ServiceOrder;
use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Banco de trabajo del técnico (T2/T3, RF-05, prioridad 2 del MVP).
 */
class WorkbenchTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    private User $carlos;

    private User $laura;

    private static int $folio = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->carlos = User::factory()->technician()->create();
        $this->laura = User::factory()->technician()->create();
    }

    private function order(string $status = OrderStatus::ASSIGNED, ?User $technician = null, array $attributes = []): ServiceOrder
    {
        $customer = Customer::factory()->create();
        $device = $customer->devices()->create(['type' => 'Celular', 'brand' => 'Motorola']);

        return ServiceOrder::create($attributes + [
            'folio' => sprintf('OS-TEST-%05d', ++self::$folio),
            'customer_id' => $customer->id,
            'device_id' => $device->id,
            'status_id' => OrderStatus::idFor($status),
            'technician_id' => ($technician ?? $this->carlos)->id,
            'reported_issue' => 'No carga.',
            'device_pin' => '2580',
            'received_by' => $this->carlos->id,
        ]);
    }

    private function as(User $user, string $method, string $uri, array $data = []): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($user->createToken('Tablet', ['staff'])->plainTextToken)->json($method, $uri, $data);
    }

    private function diagnosis(array $overrides = []): array
    {
        return $overrides + [
            'outcome' => 'repairable',
            'diagnosis' => 'Puerto de carga sulfatado; requiere cambio de puerto.',
            'failure_cause' => 'Humedad',
            'labor_level_id' => 3,
            'estimated_minutes' => 60,
        ];
    }

    public function test_technician_sees_only_his_own_orders(): void
    {
        $mine = $this->order();
        $this->order(OrderStatus::ASSIGNED, $this->laura);

        $this->as($this->carlos, 'GET', '/api/v1/my/orders')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.folio', $mine->folio)
            ->assertJsonPath('data.0.device_pin', '2580');
    }

    public function test_technician_cannot_open_an_order_assigned_to_someone_else(): void
    {
        $other = $this->order(OrderStatus::ASSIGNED, $this->laura);

        $this->as($this->carlos, 'GET', "/api/v1/my/orders/{$other->folio}")->assertStatus(404);
        $this->as($this->carlos, 'POST', "/api/v1/my/orders/{$other->folio}/start")->assertStatus(404);
    }

    public function test_start_moves_the_order_to_diagnosis_and_starts_the_timer(): void
    {
        $order = $this->order();

        $this->as($this->carlos, 'POST', "/api/v1/my/orders/{$order->folio}/start")
            ->assertOk()
            ->assertJsonPath('data.status.code', 'diagnosing')
            ->assertJsonPath('timer.running', true);

        $this->assertDatabaseHas('order_time_logs', ['service_order_id' => $order->id, 'technician_id' => $this->carlos->id, 'type' => 'diagnosis', 'ends_at' => null]);
        $this->assertDatabaseHas('order_logs', [
            'service_order_id' => $order->id,
            'type' => 'status_change',
            'new_status_id' => OrderStatus::idFor(OrderStatus::DIAGNOSING),
            'user_id' => $this->carlos->id,
        ]);
    }

    public function test_a_technician_cannot_work_on_two_orders_at_the_same_time(): void
    {
        $first = $this->order();
        $second = $this->order();

        $this->as($this->carlos, 'POST', "/api/v1/my/orders/{$first->folio}/start")->assertOk();

        $this->as($this->carlos, 'POST', "/api/v1/my/orders/{$second->folio}/start")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['status' => "Ya estás trabajando en la orden {$first->folio}. Páusala antes de iniciar otra."]);

        // Al pausar la primera ya puede iniciar la segunda
        $this->as($this->carlos, 'POST', "/api/v1/my/orders/{$first->folio}/pause", ['reason' => 'Espera refacción'])->assertOk();
        $this->as($this->carlos, 'POST', "/api/v1/my/orders/{$second->folio}/start")->assertOk();
    }

    public function test_pause_and_resume_keep_the_status_and_control_the_timer(): void
    {
        $order = $this->order();
        $this->as($this->carlos, 'POST', "/api/v1/my/orders/{$order->folio}/start")->assertOk();

        $this->travel(30)->minutes();

        $this->as($this->carlos, 'POST', "/api/v1/my/orders/{$order->folio}/pause", ['reason' => 'Falta el PIN del cliente'])
            ->assertOk()
            ->assertJsonPath('data.status.code', 'diagnosing')
            ->assertJsonPath('data.is_paused', true)
            ->assertJsonPath('data.pause_reason', 'Falta el PIN del cliente')
            ->assertJsonPath('timer.running', false)
            ->assertJsonPath('timer.worked_minutes', 30);

        $this->as($this->carlos, 'POST', "/api/v1/my/orders/{$order->folio}/start")
            ->assertStatus(422); // en pausa no se inicia, se reanuda

        $this->as($this->carlos, 'POST', "/api/v1/my/orders/{$order->folio}/resume")
            ->assertOk()
            ->assertJsonPath('data.is_paused', false)
            ->assertJsonPath('timer.running', true);

        $this->assertDatabaseHas('order_logs', ['service_order_id' => $order->id, 'type' => 'pause']);
        $this->assertDatabaseHas('order_logs', ['service_order_id' => $order->id, 'type' => 'resume']);
    }

    public function test_pause_requires_a_reason(): void
    {
        $order = $this->order(OrderStatus::DIAGNOSING);

        $this->as($this->carlos, 'POST', "/api/v1/my/orders/{$order->folio}/pause")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['reason' => 'El campo motivo de la pausa es obligatorio.']);
    }

    public function test_repairable_diagnosis_sends_the_order_to_quoting(): void
    {
        $order = $this->order();
        $this->as($this->carlos, 'POST', "/api/v1/my/orders/{$order->folio}/start")->assertOk();
        $this->travel(45)->minutes();

        $this->as($this->carlos, 'POST', "/api/v1/my/orders/{$order->folio}/diagnosis", $this->diagnosis())
            ->assertOk()
            ->assertJsonPath('data.status.code', 'quoting')
            ->assertJsonPath('data.diagnosis', 'Puerto de carga sulfatado; requiere cambio de puerto.')
            ->assertJsonPath('data.labor_level_id', 3)
            ->assertJsonPath('timer.running', false)
            ->assertJsonPath('timer.worked_minutes', 45);

        $order->refresh();
        $this->assertNotNull($order->quoting_started_at); // lo llena el trigger de la BD
        $this->assertDatabaseHas('order_logs', ['service_order_id' => $order->id, 'type' => 'diagnosis']);
    }

    public function test_not_repairable_diagnosis_requires_a_reason(): void
    {
        $order = $this->order(OrderStatus::DIAGNOSING);

        $this->as($this->carlos, 'POST', "/api/v1/my/orders/{$order->folio}/diagnosis", [
            'outcome' => 'not_repairable',
            'diagnosis' => 'Placa con corto en el procesador.',
        ])->assertStatus(422)->assertJsonValidationErrors('no_repair_reason');

        $this->as($this->carlos, 'POST', "/api/v1/my/orders/{$order->folio}/diagnosis", [
            'outcome' => 'not_repairable',
            'diagnosis' => 'Placa con corto en el procesador.',
            'no_repair_reason' => 'No hay refacción de la placa en el mercado.',
        ])
            ->assertOk()
            ->assertJsonPath('data.status.code', 'not_repairable')
            ->assertJsonPath('data.no_repair_reason', 'No hay refacción de la placa en el mercado.')
            ->assertJsonPath('data.labor_level_id', null);
    }

    public function test_diagnosis_is_only_allowed_while_diagnosing(): void
    {
        $order = $this->order(OrderStatus::ASSIGNED);

        $this->as($this->carlos, 'POST', "/api/v1/my/orders/{$order->folio}/diagnosis", $this->diagnosis())
            ->assertStatus(422)
            ->assertJsonValidationErrors('status');

        $this->assertNull($order->fresh()->diagnosis);
    }

    public function test_labor_level_must_exist(): void
    {
        $order = $this->order(OrderStatus::DIAGNOSING);

        $this->as($this->carlos, 'POST', "/api/v1/my/orders/{$order->folio}/diagnosis", $this->diagnosis(['labor_level_id' => 999]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('labor_level_id');
    }

    public function test_orders_out_of_the_workshop_cannot_be_started(): void
    {
        $order = $this->order(OrderStatus::QUOTING);

        $this->as($this->carlos, 'POST', "/api/v1/my/orders/{$order->folio}/start")
            ->assertStatus(422)
            ->assertJsonValidationErrors('status');

        $this->assertSame(0, OrderTimeLog::count());
    }

    public function test_cashier_has_no_workbench(): void
    {
        $this->as(User::factory()->cashier()->create(), 'GET', '/api/v1/my/orders')->assertStatus(403);
    }

    public function test_labor_levels_catalog(): void
    {
        $this->as($this->carlos, 'GET', '/api/v1/labor-levels')
            ->assertOk()
            ->assertJsonCount(5, 'data')
            ->assertJsonPath('data.0.name', 'Adicional');
    }
}
