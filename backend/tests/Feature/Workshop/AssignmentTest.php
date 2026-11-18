<?php

namespace Tests\Feature\Workshop;

use App\Models\Customer;
use App\Models\OrderStatus;
use App\Models\ServiceOrder;
use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * El jefe de técnicos asigna órdenes a los técnicos (J2, RF-04, prioridad 2 del MVP).
 */
class AssignmentTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    private User $head;

    private User $carlos;

    private User $laura;

    private static int $folio = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->head = User::factory()->headTechnician()->create();
        $this->carlos = User::factory()->technician()->create(['name' => 'Carlos Ruiz']);
        $this->laura = User::factory()->technician()->create(['name' => 'Laura Vega']);
    }

    private function order(string $status = OrderStatus::RECEIVED, array $attributes = []): ServiceOrder
    {
        $customer = Customer::factory()->create();
        $device = $customer->devices()->create(['type' => 'Celular', 'brand' => 'Samsung']);

        return ServiceOrder::create($attributes + [
            'folio' => sprintf('OS-TEST-%05d', ++self::$folio),
            'customer_id' => $customer->id,
            'device_id' => $device->id,
            'status_id' => OrderStatus::idFor($status),
            'reported_issue' => 'No enciende.',
            'received_by' => $this->head->id,
        ]);
    }

    private function as(User $user, string $method, string $uri, array $data = []): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($user->createToken('PC', ['staff'])->plainTextToken)->json($method, $uri, $data);
    }

    public function test_head_assigns_a_received_order_to_a_technician(): void
    {
        $order = $this->order();

        $this->as($this->head, 'POST', "/api/v1/service-orders/{$order->folio}/assign", [
            'technician_id' => $this->carlos->id,
            'priority' => 'urgent',
        ])
            ->assertOk()
            ->assertJsonPath('data.status.code', 'assigned')
            ->assertJsonPath('data.technician.name', 'Carlos Ruiz')
            ->assertJsonPath('data.priority', 'urgent')
            ->assertJsonPath('message', "Orden {$order->folio} asignada a Carlos Ruiz.");

        $order->refresh();
        $this->assertSame($this->head->id, $order->assigned_by);
        $this->assertNotNull($order->assigned_at); // lo llena el trigger de la BD
    }

    public function test_assignment_is_written_to_the_order_log(): void
    {
        $order = $this->order();

        $this->as($this->head, 'POST', "/api/v1/service-orders/{$order->folio}/assign", ['technician_id' => $this->carlos->id])->assertOk();

        $this->assertDatabaseHas('order_logs', ['service_order_id' => $order->id, 'type' => 'assignment', 'user_id' => $this->head->id]);
        $this->assertDatabaseHas('order_logs', [
            'service_order_id' => $order->id,
            'type' => 'status_change',
            'previous_status_id' => OrderStatus::idFor(OrderStatus::RECEIVED),
            'new_status_id' => OrderStatus::idFor(OrderStatus::ASSIGNED),
            'visible_to_customer' => true,
        ]);
    }

    public function test_reassigning_during_diagnosis_keeps_the_current_stage(): void
    {
        $order = $this->order(OrderStatus::DIAGNOSING, ['technician_id' => $this->carlos->id]);

        $this->as($this->head, 'POST', "/api/v1/service-orders/{$order->folio}/assign", ['technician_id' => $this->laura->id])
            ->assertOk()
            ->assertJsonPath('data.status.code', 'diagnosing')
            ->assertJsonPath('data.technician.name', 'Laura Vega');
    }

    public function test_cannot_assign_to_the_same_technician_again(): void
    {
        $order = $this->order(OrderStatus::ASSIGNED, ['technician_id' => $this->carlos->id]);

        $this->as($this->head, 'POST', "/api/v1/service-orders/{$order->folio}/assign", ['technician_id' => $this->carlos->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['technician_id' => 'La orden ya está asignada a Carlos Ruiz.']);
    }

    public function test_only_active_staff_who_repair_can_receive_orders(): void
    {
        $order = $this->order();
        $cashier = User::factory()->cashier()->create();
        $inactive = User::factory()->technician()->inactive()->create();

        foreach ([$cashier->id, $inactive->id, 999999] as $id) {
            $this->as($this->head, 'POST', "/api/v1/service-orders/{$order->folio}/assign", ['technician_id' => $id])
                ->assertStatus(422)
                ->assertJsonValidationErrors('technician_id');
        }

        $this->assertNull($order->fresh()->technician_id);
    }

    public function test_orders_ready_for_pickup_or_delivered_cannot_be_reassigned(): void
    {
        foreach ([OrderStatus::READY_FOR_PICKUP, OrderStatus::DELIVERED, OrderStatus::ABANDONED] as $status) {
            $order = $this->order($status, ['technician_id' => $this->carlos->id]);

            $this->as($this->head, 'POST', "/api/v1/service-orders/{$order->folio}/assign", ['technician_id' => $this->laura->id])
                ->assertStatus(422)
                ->assertJsonValidationErrors('folio');
        }
    }

    public function test_unknown_folio_returns_404(): void
    {
        $this->as($this->head, 'POST', '/api/v1/service-orders/OS-1999-99999/assign', ['technician_id' => $this->carlos->id])
            ->assertStatus(404);
    }

    public function test_cashier_and_technician_cannot_assign(): void
    {
        $order = $this->order();

        foreach ([User::factory()->cashier()->create(), $this->carlos] as $user) {
            $this->as($user, 'POST', "/api/v1/service-orders/{$order->folio}/assign", ['technician_id' => $this->laura->id])
                ->assertStatus(403);
        }
    }

    public function test_technicians_are_listed_least_busy_first_with_their_workload(): void
    {
        $this->order(OrderStatus::DIAGNOSING, ['technician_id' => $this->carlos->id, 'priority' => 'urgent']);
        $this->order(OrderStatus::ASSIGNED, ['technician_id' => $this->carlos->id]);
        // Las órdenes entregadas no son carga, y Laura debe seguir apareciendo con 0 (corrección de la vista)
        $this->order(OrderStatus::DELIVERED, ['technician_id' => $this->laura->id]);

        $response = $this->as($this->head, 'GET', '/api/v1/technicians')->assertOk();

        $this->assertSame(['Laura Vega', 'Carlos Ruiz'], collect($response->json('data'))->pluck('name')->all());
        $response->assertJsonPath('data.0.active_orders', 0)
            ->assertJsonPath('data.1.active_orders', 2)
            ->assertJsonPath('data.1.priority_orders', 1)
            ->assertJsonPath('data.1.diagnosing', 1);
    }

    public function test_board_counts_orders_by_status_and_unassigned(): void
    {
        $this->order();
        $this->order(OrderStatus::RECEIVED, ['priority' => 'high', 'diagnosis_due_at' => now()->subHour()]);
        $this->order(OrderStatus::ASSIGNED, ['technician_id' => $this->carlos->id]);
        $this->order(OrderStatus::DELIVERED, ['technician_id' => $this->carlos->id]);

        $data = $this->as($this->head, 'GET', '/api/v1/workshop/board')->assertOk()->json('data');

        $this->assertSame(['received' => 2, 'assigned' => 1], collect($data['by_status'])->pluck('total', 'code')->all());
        $this->assertSame(2, $data['unassigned']);
        $this->assertSame(1, $data['urgent']);
        $this->assertSame(1, $data['diagnosis_overdue']);
    }

    public function test_head_filters_orders_by_technician_and_unassigned(): void
    {
        $mine = $this->order(OrderStatus::ASSIGNED, ['technician_id' => $this->carlos->id]);
        $free = $this->order();

        $this->as($this->head, 'GET', "/api/v1/service-orders?technician_id={$this->carlos->id}")
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.folio', $mine->folio);

        $this->as($this->head, 'GET', '/api/v1/service-orders?unassigned=1&active=1')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.folio', $free->folio);
    }
}
