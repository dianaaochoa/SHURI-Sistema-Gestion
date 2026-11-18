<?php

namespace Tests\Feature\Workshop;

use App\Models\Customer;
use App\Models\OrderStatus;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Notifications\DevicesAbandonedNotification;
use App\Services\SettingsService;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Resguardo y abandono (RF-09, J9). Configuración sembrada: 7 días de gracia,
 * $10 por día de almacenaje, abandono a los 90 días y aviso 7 días antes.
 */
class StorageTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    private User $head;

    private User $cashier;

    private Customer $customer;

    private int $next = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->head = User::factory()->headTechnician()->create();
        $this->cashier = User::factory()->cashier()->create(['cash_register_id' => 1]);
        $this->customer = Customer::factory()->create(['email' => 'ana@example.com']);
    }

    private function as(User $user, string $method, string $uri, array $data = []): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($user->createToken('PC', ['staff'])->plainTextToken)->json($method, $uri, $data);
    }

    /** Orden lista para recoger desde hace $days días (ready_at fijado al crearla). */
    private function readySince(int $days, array $attributes = []): ServiceOrder
    {
        $device = $this->customer->devices()->create(['type' => 'Celular', 'brand' => 'Apple', 'model' => 'iPhone 12']);

        return ServiceOrder::create($attributes + [
            'folio' => sprintf('OS-TEST-%05d', ++$this->next), 'customer_id' => $this->customer->id, 'device_id' => $device->id,
            'status_id' => OrderStatus::idFor(OrderStatus::READY_FOR_PICKUP), 'reported_issue' => 'No enciende.',
            'received_by' => $this->head->id, 'labor_cost' => 500, 'ready_at' => now()->subDays($days),
        ]);
    }

    private function statusOf(ServiceOrder $order): string
    {
        return $order->fresh('status')->status->code;
    }

    public function test_storage_list_shows_the_fee_and_the_alert(): void
    {
        $this->readySince(3);
        $charging = $this->readySince(10);

        $response = $this->as($this->head, 'GET', '/api/v1/storage')
            ->assertOk()
            ->assertJsonPath('summary.waiting', 2)
            ->assertJsonPath('summary.charging', 1);

        $row = collect($response->json('data'))->firstWhere('folio', $charging->folio);
        $this->assertSame('charging', $row['alert']);
        $this->assertSame(3, $row['chargeable_days']);
        $this->assertEquals(30, $row['storage_fee']);

        $this->as($this->head, 'GET', '/api/v1/storage?alert=grace_period')->assertJsonCount(1, 'data');
    }

    public function test_daily_process_sends_each_notice_once_and_abandons_after_90_days(): void
    {
        Mail::fake();
        Notification::fake();

        $charging = $this->readySince(10);
        $warning = $this->readySince(85);
        $old = $this->readySince(95);

        $this->artisan('shuri:process-storage')->assertSuccessful();

        $this->assertDatabaseHas('sent_emails', ['service_order_id' => $charging->id, 'type' => 'storage_fee_notice', 'status' => 'sent']);
        $this->assertDatabaseHas('sent_emails', ['service_order_id' => $warning->id, 'type' => 'abandonment_notice', 'status' => 'sent']);

        // A los 95 días: En Abandono, con el almacenaje acumulado guardado (88 días × $10)
        $this->assertSame(OrderStatus::ABANDONED, $this->statusOf($old));
        $this->assertEquals(880, $old->fresh()->storage_fee);
        $this->assertNotNull($old->fresh()->abandoned_at);
        $this->assertDatabaseHas('order_logs', ['service_order_id' => $old->id, 'type' => 'abandonment', 'visible_to_customer' => true]);
        $this->assertDatabaseHas('audit_logs', ['record_id' => $old->id, 'action' => 'auto_abandonment']);
        Notification::assertSentTo($this->head, DevicesAbandonedNotification::class);

        // Correrlo otra vez no repite avisos ni abandona de nuevo
        $this->as($this->head, 'POST', '/api/v1/storage/process')
            ->assertOk()
            ->assertJsonPath('data.storage_fee_notices', 0)
            ->assertJsonPath('data.abandonment_notices', 0)
            ->assertJsonCount(0, 'data.abandoned');

        $this->assertDatabaseCount('sent_emails', 2);
    }

    public function test_cashier_charges_the_storage_fee_on_delivery(): void
    {
        $order = $this->readySince(12); // 5 días × $10

        $this->as($this->cashier, 'POST', '/api/v1/cash-shifts')->assertCreated();
        $this->as($this->cashier, 'POST', '/api/v1/sales', [
            'items' => [['type' => 'service_order', 'folio' => $order->folio]],
            'payments' => [['method' => 'cash', 'amount' => 550]],
        ])->assertCreated()->assertJsonPath('data.total', 550);

        $this->assertSame(OrderStatus::DELIVERED, $this->statusOf($order));
        $this->assertEquals(50, $order->fresh()->storage_fee);
    }

    public function test_head_waives_the_storage_fee(): void
    {
        $order = $this->readySince(12);

        $this->as($this->head, 'POST', "/api/v1/service-orders/{$order->folio}/waive-storage", ['reason' => 'Cliente hospitalizado'])
            ->assertOk()
            ->assertJsonPath('data.storage_fee', 0)
            ->assertJsonPath('data.storage_fee_waived', true);

        $this->as($this->head, 'POST', "/api/v1/service-orders/{$order->folio}/waive-storage", ['reason' => 'Otra vez'])
            ->assertUnprocessable();

        $this->assertDatabaseHas('audit_logs', ['record_id' => $order->id, 'action' => 'storage_fee_waived']);
    }

    public function test_abandoned_device_goes_to_storage_and_then_to_disposal(): void
    {
        $order = $this->readySince(95);
        $this->as($this->head, 'POST', '/api/v1/storage/process')->assertOk();

        $this->as($this->head, 'GET', '/api/v1/storage?alert=abandoned')
            ->assertJsonPath('data.0.folio', $order->folio)
            ->assertJsonPath('data.0.storage_fee', 880);

        $this->as($this->head, 'POST', "/api/v1/service-orders/{$order->folio}/send-to-storage")
            ->assertOk()->assertJsonPath('data.location', 'storage');

        $this->as($this->head, 'POST', "/api/v1/service-orders/{$order->folio}/dispose", ['notes' => 'Entregado a reciclaje'])
            ->assertOk()
            ->assertJsonPath('data.status_code', OrderStatus::DISPOSED);

        $this->assertSame($this->head->id, $order->fresh()->disposed_by);
        $this->assertDatabaseHas('order_logs', ['service_order_id' => $order->id, 'type' => 'disposal']);
    }

    public function test_only_abandoned_devices_can_be_disposed(): void
    {
        $order = $this->readySince(20);

        $this->as($this->head, 'POST', "/api/v1/service-orders/{$order->folio}/dispose")
            ->assertUnprocessable()->assertJsonValidationErrors('status');
    }

    public function test_abandoned_device_cannot_be_delivered_unless_the_setting_allows_it(): void
    {
        $order = $this->readySince(95);
        $this->as($this->head, 'POST', '/api/v1/storage/process')->assertOk();
        $this->as($this->cashier, 'POST', '/api/v1/cash-shifts')->assertCreated();

        $sale = ['items' => [['type' => 'service_order', 'folio' => $order->folio]], 'payments' => [['method' => 'cash', 'amount' => 1380]]];

        $this->as($this->cashier, 'POST', '/api/v1/sales', $sale)->assertUnprocessable()->assertJsonValidationErrors('items.0.folio');

        DB::table('settings')->where('key', 'allow_delivery_when_abandoned')->update(['value' => '1']);
        app(SettingsService::class)->refresh();

        // $500 de reparación + $880 de almacenaje congelado
        $this->as($this->cashier, 'POST', '/api/v1/sales', $sale)->assertCreated()->assertJsonPath('data.total', 1380);
        $this->assertSame(OrderStatus::DELIVERED, $this->statusOf($order));
    }

    public function test_permissions(): void
    {
        $order = $this->readySince(12);

        $this->as($this->cashier, 'GET', '/api/v1/storage')->assertForbidden();
        $this->as($this->cashier, 'POST', "/api/v1/service-orders/{$order->folio}/waive-storage", ['reason' => 'Cliente frecuente'])->assertForbidden();
        $this->as(User::factory()->technician()->create(), 'POST', '/api/v1/storage/process')->assertForbidden();
    }
}
