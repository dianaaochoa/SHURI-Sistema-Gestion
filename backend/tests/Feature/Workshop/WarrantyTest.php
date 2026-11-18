<?php

namespace Tests\Feature\Workshop;

use App\Mail\OrderUpdateMail;
use App\Models\CashShift;
use App\Models\Customer;
use App\Models\OrderStatus;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Models\Warranty;
use App\Notifications\WarrantyRequestedNotification;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Garantías (P3, C4, J4, T4 · RF-11, README §14.4).
 */
class WarrantyTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    private User $cashier;

    private User $head;

    private User $technician;

    private Customer $customer;

    private ServiceOrder $order;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();
        $this->cashier = User::factory()->cashier()->create(['cash_register_id' => 1]);
        $this->head = User::factory()->headTechnician()->create();
        $this->technician = User::factory()->technician()->create(['name' => 'Carlos Ruiz']);
        $this->customer = Customer::factory()->create(['email' => 'ana@correo.com']);
        $this->order = $this->deliveredOrder();
    }

    private function deliveredOrder(array $attributes = []): ServiceOrder
    {
        static $n = 0;
        $device = $this->customer->devices()->create(['type' => 'Celular', 'brand' => 'Samsung', 'model' => 'Galaxy A54']);

        return ServiceOrder::create($attributes + [
            'folio' => sprintf('OS-TEST-%05d', ++$n),
            'customer_id' => $this->customer->id,
            'device_id' => $device->id,
            'status_id' => OrderStatus::idFor(OrderStatus::DELIVERED),
            'technician_id' => $this->technician->id,
            'reported_issue' => 'Pantalla rota.',
            'received_by' => $this->cashier->id,
            'labor_cost' => 580,
            'is_paid' => true,
            'delivered_at' => now()->subDays(5),
            'warranty_until' => today()->addDays(25),
        ]);
    }

    private function as(User|Customer $account, string $method, string $uri, array $data = []): TestResponse
    {
        $this->app['auth']->forgetGuards();
        $ability = $account instanceof User ? 'staff' : 'customer';

        return $this->withToken($account->createToken('PC', [$ability])->plainTextToken)->json($method, $uri, $data);
    }

    /** El cliente la pide, la cajera recibe el equipo, el jefe la asigna y el técnico la revisa. */
    private function warrantyAwaitingRuling(): string
    {
        $folio = $this->as($this->customer, 'POST', "/api/v1/portal/orders/{$this->order->folio}/warranty", [
            'reason' => 'La pantalla dejó de responder al tacto.',
        ])->assertCreated()->json('data.folio');

        $this->as($this->cashier, 'POST', "/api/v1/warranties/{$folio}/receive")->assertOk();
        $this->as($this->head, 'POST', "/api/v1/warranties/{$folio}/assign", ['technician_id' => $this->technician->id])->assertOk();
        $this->as($this->technician, 'POST', "/api/v1/my/warranties/{$folio}/review", [
            'report' => 'El digitalizador falla en la esquina; es defecto de la pieza instalada.',
        ])->assertOk()->assertJsonPath('data.status', 'awaiting_ruling');

        return $folio;
    }

    public function test_customer_requests_a_warranty_from_the_portal(): void
    {
        Notification::fake();

        $response = $this->as($this->customer, 'POST', "/api/v1/portal/orders/{$this->order->folio}/warranty", [
            'reason' => 'La pantalla dejó de responder al tacto.',
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'requested')
            ->assertJsonPath('data.request_channel', 'portal');

        $this->assertMatchesRegularExpression('/^GAR-\d{4}-\d{5}$/', $response->json('data.folio'));
        Notification::assertSentTo($this->head, WarrantyRequestedNotification::class);
        $this->assertDatabaseHas('order_logs', ['service_order_id' => $this->order->id, 'type' => 'warranty', 'visible_to_customer' => true]);
    }

    public function test_warranty_must_be_current_and_only_one_at_a_time(): void
    {
        $expired = $this->deliveredOrder(['warranty_until' => today()->subDay()]);
        $this->as($this->customer, 'POST', "/api/v1/portal/orders/{$expired->folio}/warranty", ['reason' => 'Falla'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['service_order' => 'La garantía de esta orden no está vigente.']);

        $this->as($this->customer, 'POST', "/api/v1/portal/orders/{$this->order->folio}/warranty", ['reason' => 'Falla'])->assertCreated();
        $this->as($this->customer, 'POST', "/api/v1/portal/orders/{$this->order->folio}/warranty", ['reason' => 'Otra falla'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['service_order' => 'Esta orden ya tiene una garantía en proceso.']);
    }

    public function test_cashier_registers_a_warranty_at_the_counter(): void
    {
        $this->as($this->cashier, 'POST', "/api/v1/service-orders/{$this->order->folio}/warranties", ['reason' => 'No carga.'])
            ->assertCreated()
            ->assertJsonPath('data.status', 'received')
            ->assertJsonPath('data.request_channel', 'counter');
    }

    public function test_covered_warranty_is_repaired_and_delivered_without_cost(): void
    {
        $folio = $this->warrantyAwaitingRuling();

        $this->as($this->head, 'POST', "/api/v1/warranties/{$folio}/rule", ['ruling' => 'covered', 'reason' => 'Defecto de la pieza.'])
            ->assertOk()
            ->assertJsonPath('data.status', 'in_repair')
            ->assertJsonPath('data.ruling_name', 'Procede');
        Mail::assertSent(OrderUpdateMail::class, fn ($mail) => $mail->title === 'Dictamen de tu garantía');

        $this->as($this->technician, 'GET', '/api/v1/my/warranties')->assertJsonPath('data.0.folio', $folio);
        $this->as($this->technician, 'POST', "/api/v1/my/warranties/{$folio}/finish")
            ->assertOk()
            ->assertJsonPath('data.status', 'finished');
        Mail::assertSent(OrderUpdateMail::class, fn ($mail) => $mail->title === 'Tu equipo está listo');

        $this->as($this->cashier, 'POST', "/api/v1/warranties/{$folio}/deliver")
            ->assertOk()
            ->assertJsonPath('data.status', 'delivered');
    }

    public function test_warranty_with_cost_is_accepted_by_the_customer_and_charged_at_the_pos(): void
    {
        $folio = $this->warrantyAwaitingRuling();

        $this->as($this->head, 'POST', "/api/v1/warranties/{$folio}/rule", ['ruling' => 'covered_with_cost', 'reason' => 'Golpe nuevo'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('extra_cost');

        $this->as($this->head, 'POST', "/api/v1/warranties/{$folio}/rule", [
            'ruling' => 'covered_with_cost', 'reason' => 'Además hay un golpe nuevo en el marco.', 'extra_cost' => 250,
        ])->assertOk()->assertJsonPath('data.status', 'approved');

        $this->as($this->customer, 'POST', "/api/v1/portal/warranties/{$folio}/answer", ['accept' => true])
            ->assertOk()
            ->assertJsonPath('data.status', 'in_repair')
            ->assertJsonPath('data.extra_cost_accepted', true);

        $this->as($this->technician, 'POST', "/api/v1/my/warranties/{$folio}/finish")->assertOk();

        // Con costo no se entrega directo: se cobra en el punto de venta
        $this->as($this->cashier, 'POST', "/api/v1/warranties/{$folio}/deliver")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['status' => 'Esta garantía tiene costo extra: cóbrala en el punto de venta.']);

        CashShift::create(['cash_register_id' => 1, 'user_id' => $this->cashier->id, 'opened_at' => now(), 'opening_amount' => 500, 'status' => 'open']);

        $this->as($this->cashier, 'POST', '/api/v1/sales', [
            'items' => [['type' => 'warranty', 'folio' => $folio]],
            'payments' => [['method' => 'cash', 'amount' => 250]],
        ])
            ->assertCreated()
            ->assertJsonPath('data.total', 250)
            ->assertJsonPath('data.items.0.description', "Garantía {$folio} · costo extra");

        $this->assertSame('delivered', Warranty::first()->status);

        // No se puede cobrar dos veces
        $this->as($this->cashier, 'POST', '/api/v1/sales', [
            'items' => [['type' => 'warranty', 'folio' => $folio]],
            'payments' => [['method' => 'cash', 'amount' => 250]],
        ])->assertStatus(422)->assertJsonValidationErrors('items.0.folio');
    }

    public function test_customer_declines_the_cost_and_gets_the_device_back(): void
    {
        $folio = $this->warrantyAwaitingRuling();
        $this->as($this->head, 'POST', "/api/v1/warranties/{$folio}/rule", [
            'ruling' => 'covered_with_cost', 'reason' => 'Golpe nuevo.', 'extra_cost' => 250,
        ]);

        $this->as($this->customer, 'POST', "/api/v1/portal/warranties/{$folio}/answer", ['accept' => false])
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected');

        $this->as($this->cashier, 'POST', "/api/v1/warranties/{$folio}/deliver")->assertOk();
    }

    public function test_not_covered_warranty_returns_the_device_without_repair(): void
    {
        $folio = $this->warrantyAwaitingRuling();

        $this->as($this->head, 'POST', "/api/v1/warranties/{$folio}/rule", ['ruling' => 'not_covered', 'reason' => 'Daño por humedad.'])
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected')
            ->assertJsonPath('data.ruling_name', 'No procede');

        $this->as($this->cashier, 'POST', "/api/v1/warranties/{$folio}/deliver")->assertOk()->assertJsonPath('data.status', 'delivered');
    }

    public function test_steps_cannot_be_skipped_or_done_by_another_technician(): void
    {
        $folio = $this->as($this->customer, 'POST', "/api/v1/portal/orders/{$this->order->folio}/warranty", ['reason' => 'Falla'])
            ->json('data.folio');

        // Sin recibir el equipo no se puede mandar a revisión
        $this->as($this->head, 'POST', "/api/v1/warranties/{$folio}/assign", ['technician_id' => $this->technician->id])
            ->assertStatus(422);

        $this->as($this->cashier, 'POST', "/api/v1/warranties/{$folio}/receive")->assertOk();
        $this->as($this->head, 'POST', "/api/v1/warranties/{$folio}/assign", ['technician_id' => $this->technician->id])->assertOk();

        $other = User::factory()->technician()->create();
        $this->as($other, 'POST', "/api/v1/my/warranties/{$folio}/review", ['report' => 'Revisado'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['status' => 'Esta garantía está asignada a otro técnico.']);
    }

    public function test_customer_does_not_see_the_internal_report_or_other_customers_orders(): void
    {
        $folio = $this->warrantyAwaitingRuling();

        $this->as($this->customer, 'GET', "/api/v1/portal/orders/{$this->order->folio}/warranty")
            ->assertOk()
            ->assertJsonPath('data.folio', $folio)
            ->assertJsonMissingPath('data.technician_review');

        $this->as(Customer::factory()->create(), 'GET', "/api/v1/portal/orders/{$this->order->folio}/warranty")
            ->assertStatus(404);
    }

    public function test_only_the_head_rules_warranties(): void
    {
        $folio = $this->warrantyAwaitingRuling();

        $this->as($this->cashier, 'POST', "/api/v1/warranties/{$folio}/rule", ['ruling' => 'covered', 'reason' => 'x'])
            ->assertStatus(403);
    }
}
