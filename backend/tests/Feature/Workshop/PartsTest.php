<?php

namespace Tests\Feature\Workshop;

use App\Models\Category;
use App\Models\Customer;
use App\Models\OrderPart;
use App\Models\OrderStatus;
use App\Models\PartRequest;
use App\Models\Product;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Notifications\PartRequestedNotification;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Refacciones del taller (T5, J5 · RF-05): pedir, entregar, rechazar y devolver.
 */
class PartsTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    private User $head;

    private User $technician;

    private ServiceOrder $order;

    private Product $battery;

    protected function setUp(): void
    {
        parent::setUp();

        $this->head = User::factory()->headTechnician()->create();
        $this->technician = User::factory()->technician()->create(['name' => 'Carlos Ruiz']);
        $this->battery = Product::create([
            'category_id' => Category::where('name', 'Baterías')->value('id'),
            'sku' => 'BAT-IP11', 'name' => 'Batería iPhone 11', 'type' => 'part',
            'purchase_price' => 250, 'sale_price' => 550, 'stock' => 3,
        ]);

        $customer = Customer::factory()->create();
        $device = $customer->devices()->create(['type' => 'Celular', 'brand' => 'Apple', 'model' => 'iPhone 11']);
        $this->order = ServiceOrder::create([
            'folio' => 'OS-TEST-00001', 'customer_id' => $customer->id, 'device_id' => $device->id,
            'status_id' => OrderStatus::idFor(OrderStatus::IN_REPAIR), 'technician_id' => $this->technician->id,
            'reported_issue' => 'La batería dura poco.', 'received_by' => $this->head->id,
        ]);
    }

    private function as(User $user, string $method, string $uri, array $data = []): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($user->createToken('PC', ['staff'])->plainTextToken)->json($method, $uri, $data);
    }

    private function requestBattery(int $quantity = 1): string
    {
        return $this->as($this->technician, 'POST', "/api/v1/my/orders/{$this->order->folio}/part-requests", [
            'product_id' => $this->battery->id, 'quantity' => $quantity, 'urgency' => 'urgent',
        ])->assertCreated()->json('data.folio');
    }

    public function test_technician_requests_a_part_and_the_head_is_notified(): void
    {
        Notification::fake();

        $response = $this->as($this->technician, 'POST', "/api/v1/my/orders/{$this->order->folio}/part-requests", [
            'product_id' => $this->battery->id, 'quantity' => 1, 'urgency' => 'urgent', 'notes' => 'El cliente ya aprobó',
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.description', 'Batería iPhone 11')
            ->assertJsonPath('data.product.can_deliver', true);

        $this->assertMatchesRegularExpression('/^SR-\d{4}-\d{5}$/', $response->json('data.folio'));
        Notification::assertSentTo($this->head, PartRequestedNotification::class);
        Notification::assertNotSentTo($this->technician, PartRequestedNotification::class);
        $this->assertDatabaseHas('order_logs', ['service_order_id' => $this->order->id, 'type' => 'part', 'visible_to_customer' => false]);
    }

    public function test_head_delivers_and_the_part_leaves_stock_linked_to_the_order(): void
    {
        $folio = $this->requestBattery();

        $this->as($this->head, 'GET', '/api/v1/part-requests?status=pending')
            ->assertOk()
            ->assertJsonPath('data.0.folio', $folio)
            ->assertJsonPath('data.0.technician', 'Carlos Ruiz');

        $this->as($this->head, 'POST', "/api/v1/part-requests/{$folio}/deliver")
            ->assertOk()
            ->assertJsonPath('data.status', 'delivered');

        $this->assertSame(2, $this->battery->fresh()->stock);
        $this->assertDatabaseHas('inventory_movements', [
            'product_id' => $this->battery->id, 'type' => 'workshop_use', 'quantity' => -1, 'service_order_id' => $this->order->id,
        ]);
        $this->assertDatabaseHas('order_parts', ['service_order_id' => $this->order->id, 'product_id' => $this->battery->id, 'quantity' => 1, 'unit_price' => 550]);

        // El técnico ve la pieza en su banco de trabajo
        $this->as($this->technician, 'GET', "/api/v1/my/orders/{$this->order->folio}")
            ->assertJsonPath('parts.0.product', 'Batería iPhone 11');
    }

    public function test_delivery_without_stock_changes_nothing(): void
    {
        $folio = $this->requestBattery(5);

        $this->as($this->head, 'POST', "/api/v1/part-requests/{$folio}/deliver")
            ->assertStatus(422)
            ->assertJsonPath('code', 'INSUFFICIENT_STOCK');

        $this->assertSame(3, $this->battery->fresh()->stock);
        $this->assertSame('pending', PartRequest::first()->status);
        $this->assertDatabaseCount('order_parts', 0);
    }

    public function test_a_request_is_delivered_only_once(): void
    {
        $folio = $this->requestBattery();
        $this->as($this->head, 'POST', "/api/v1/part-requests/{$folio}/deliver")->assertOk();

        $this->as($this->head, 'POST', "/api/v1/part-requests/{$folio}/deliver")
            ->assertStatus(422)
            ->assertJsonValidationErrors('status');

        $this->assertSame(2, $this->battery->fresh()->stock);
    }

    public function test_described_part_needs_a_catalog_product_to_be_delivered(): void
    {
        $folio = $this->as($this->technician, 'POST', "/api/v1/my/orders/{$this->order->folio}/part-requests", [
            'description' => 'Batería compatible iPhone 11 de alta capacidad',
        ])->assertCreated()->json('data.folio');

        $this->as($this->head, 'POST', "/api/v1/part-requests/{$folio}/deliver")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['product_id' => 'Elige la refacción del catálogo que vas a entregar.']);

        $this->as($this->head, 'POST', "/api/v1/part-requests/{$folio}/deliver", ['product_id' => $this->battery->id])
            ->assertOk()
            ->assertJsonPath('data.product.name', 'Batería iPhone 11');
    }

    public function test_head_rejects_and_the_technician_sees_why(): void
    {
        $folio = $this->requestBattery();

        $this->as($this->head, 'POST', "/api/v1/part-requests/{$folio}/reject", ['reason' => 'Usa la batería del cliente'])
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected');

        $this->as($this->technician, 'GET', '/api/v1/my/part-requests')
            ->assertJsonPath('data.0.status_name', 'Rechazada')
            ->assertJsonPath('data.0.rejection_reason', 'Usa la batería del cliente');
    }

    public function test_technician_cancels_only_pending_requests(): void
    {
        $folio = $this->requestBattery();
        $this->as($this->technician, 'POST', "/api/v1/my/part-requests/{$folio}/cancel")->assertOk()->assertJsonPath('data.status', 'cancelled');

        $delivered = $this->requestBattery();
        $this->as($this->head, 'POST', "/api/v1/part-requests/{$delivered}/deliver")->assertOk();
        $this->as($this->technician, 'POST', "/api/v1/my/part-requests/{$delivered}/cancel")->assertStatus(422);
    }

    public function test_parts_can_only_be_requested_for_own_orders_still_in_the_workshop(): void
    {
        $other = User::factory()->technician()->create();
        $this->as($other, 'POST', "/api/v1/my/orders/{$this->order->folio}/part-requests", ['product_id' => $this->battery->id])
            ->assertStatus(404);

        $this->order->update(['status_id' => OrderStatus::idFor(OrderStatus::READY_FOR_PICKUP)]);
        $this->as($this->technician, 'POST', "/api/v1/my/orders/{$this->order->folio}/part-requests", ['product_id' => $this->battery->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors('status');
    }

    public function test_unused_part_returns_to_stock_when_the_head_receives_it(): void
    {
        $folio = $this->requestBattery(2);
        $this->as($this->head, 'POST', "/api/v1/part-requests/{$folio}/deliver")->assertOk(); // stock 3 → 1
        $part = OrderPart::first();

        $this->as($this->technician, 'POST', "/api/v1/my/order-parts/{$part->id}/return", ['quantity' => 3, 'reason' => 'No se usó'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['quantity' => 'Solo puedes devolver 2 pieza(s) de esta refacción.']);

        $returnId = $this->as($this->technician, 'POST', "/api/v1/my/order-parts/{$part->id}/return", [
            'quantity' => 1, 'reason' => 'Solo hizo falta una', 'condition' => 'new',
        ])->assertCreated()->json('data.id');

        $this->as($this->head, 'GET', '/api/v1/part-returns')->assertJsonPath('data.0.id', $returnId);

        $this->as($this->head, 'POST', "/api/v1/part-returns/{$returnId}/receive", ['condition' => 'new'])
            ->assertOk()
            ->assertJsonPath('data.returns_to_stock', true);

        $this->assertSame(2, $this->battery->fresh()->stock);
        $this->assertSame(1, $part->fresh()->returned_quantity);
        $this->assertDatabaseHas('inventory_movements', ['product_id' => $this->battery->id, 'type' => 'workshop_return', 'quantity' => 1]);
    }

    public function test_damaged_part_does_not_return_to_stock(): void
    {
        $folio = $this->requestBattery();
        $this->as($this->head, 'POST', "/api/v1/part-requests/{$folio}/deliver")->assertOk(); // stock 3 → 2
        $part = OrderPart::first();

        $returnId = $this->as($this->technician, 'POST', "/api/v1/my/order-parts/{$part->id}/return", [
            'quantity' => 1, 'reason' => 'Llegó defectuosa',
        ])->json('data.id');

        $this->as($this->head, 'POST', "/api/v1/part-returns/{$returnId}/receive", ['condition' => 'damaged', 'returns_to_stock' => true])
            ->assertOk()
            ->assertJsonPath('data.returns_to_stock', false);

        $this->assertSame(2, $this->battery->fresh()->stock);
    }

    public function test_roles_cannot_swap_sides(): void
    {
        $this->as($this->technician, 'GET', '/api/v1/part-requests')->assertStatus(403);
        $this->as($this->head, 'POST', "/api/v1/my/orders/{$this->order->folio}/part-requests", ['product_id' => $this->battery->id])
            ->assertStatus(403);
    }
}
