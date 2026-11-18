<?php

namespace Tests\Feature\Workshop;

use App\Mail\OrderUpdateMail;
use App\Models\Category;
use App\Models\Customer;
use App\Models\OrderStatus;
use App\Models\Product;
use App\Models\Quote;
use App\Models\ServiceOrder;
use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Cotización y aprobación (J3, P2, J8 · RF-10, RF-07, RF-17).
 */
class QuoteTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    private User $head;

    private User $technician;

    private Customer $customer;

    private ServiceOrder $order;

    private Product $screen;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();
        $this->head = User::factory()->headTechnician()->create();
        $this->technician = User::factory()->technician()->create();
        $this->customer = Customer::factory()->create(['email' => 'ana@correo.com']);

        $this->screen = Product::create([
            'category_id' => Category::where('name', 'Pantallas')->value('id'),
            'sku' => 'PAN-A54', 'name' => 'Pantalla Galaxy A54', 'type' => 'part',
            'purchase_price' => 450, 'sale_price' => 720, 'stock' => 3,
        ]);

        $device = $this->customer->devices()->create(['type' => 'Celular', 'brand' => 'Samsung', 'model' => 'Galaxy A54']);
        $this->order = ServiceOrder::create([
            'folio' => 'OS-TEST-00001',
            'customer_id' => $this->customer->id,
            'device_id' => $device->id,
            'status_id' => OrderStatus::idFor(OrderStatus::DIAGNOSING),
            'technician_id' => $this->technician->id,
            'reported_issue' => 'Pantalla rota.',
            'received_by' => $this->head->id,
        ]);
    }

    private function as(User|Customer $account, string $method, string $uri, array $data = []): TestResponse
    {
        $this->app['auth']->forgetGuards();
        $ability = $account instanceof User ? 'staff' : 'customer';

        return $this->withToken($account->createToken('PC', [$ability])->plainTextToken)->json($method, $uri, $data);
    }

    /** El técnico diagnostica y devuelve el folio del presupuesto por cotizar. */
    private function diagnose(): string
    {
        $this->as($this->technician, 'POST', "/api/v1/my/orders/{$this->order->folio}/diagnosis", [
            'outcome' => 'repairable',
            'diagnosis' => 'Display dañado por golpe; requiere cambio de pantalla.',
            'labor_level_id' => 3,
            'estimated_minutes' => 60,
        ])->assertOk();

        return Quote::where('service_order_id', $this->order->id)->value('folio');
    }

    private function sendQuote(string $folio, array $overrides = []): TestResponse
    {
        return $this->as($this->head, 'POST', "/api/v1/quotes/{$folio}/send", $overrides + [
            'items' => [
                ['type' => 'part', 'product_id' => $this->screen->id, 'quantity' => 1],
                ['type' => 'labor', 'labor_level_id' => 3],
                ['type' => 'other', 'concept' => 'Mica de cristal templado', 'unit_price' => 100],
            ],
            'discount' => 100,
            'customer_note' => 'Incluye mica de regalo en la instalación.',
        ]);
    }

    public function test_technician_diagnosis_leaves_a_quote_to_be_priced(): void
    {
        $folio = $this->diagnose();

        $this->assertMatchesRegularExpression('/^COT-\d{4}-\d{5}$/', $folio);

        $this->as($this->head, 'GET', '/api/v1/quotes/to-quote')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.quote_folio', $folio)
            ->assertJsonPath('data.0.labor_level', 'Medio')
            ->assertJsonPath('data.0.diagnosis', 'Display dañado por golpe; requiere cambio de pantalla.');
    }

    public function test_head_prices_and_sends_the_quote_with_catalog_prices(): void
    {
        $folio = $this->diagnose();

        $this->sendQuote($folio)
            ->assertOk()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.parts_amount', 820)     // 720 pantalla + 100 mica
            ->assertJsonPath('data.labor_amount', 580)     // nivel Medio
            ->assertJsonPath('data.total', 1300)
            ->assertJsonPath('data.items.0.unit_cost', 450) // el jefe sí ve costos
            ->assertJsonPath('data.items.0.out_of_stock', false);

        $this->order->refresh();
        $this->assertSame(OrderStatus::idFor(OrderStatus::QUOTE_PENDING), $this->order->status_id);
        $this->assertEquals(1300, $this->order->estimated_cost);

        Mail::assertSent(OrderUpdateMail::class, fn ($mail) => $mail->hasTo('ana@correo.com')
            && $mail->title === 'Tienes un presupuesto por aprobar');
        $this->assertDatabaseHas('order_logs', ['service_order_id' => $this->order->id, 'type' => 'quote', 'visible_to_customer' => true]);
        $this->assertDatabaseHas('sent_emails', ['type' => 'quote_pending', 'status' => 'sent']);
    }

    public function test_part_without_stock_is_flagged_in_the_quote(): void
    {
        $this->screen->update(['stock' => 0]);
        $folio = $this->diagnose();

        $this->sendQuote($folio)->assertOk()->assertJsonPath('data.items.0.out_of_stock', true);
    }

    public function test_a_quote_cannot_be_sent_twice(): void
    {
        $folio = $this->diagnose();
        $this->sendQuote($folio)->assertOk();

        $this->sendQuote($folio)->assertStatus(422)->assertJsonValidationErrors('status');
    }

    public function test_discount_cannot_exceed_the_quote(): void
    {
        $folio = $this->diagnose();

        $this->sendQuote($folio, ['discount' => 5000])->assertStatus(422)->assertJsonValidationErrors('discount');
    }

    public function test_head_returns_the_quote_and_the_technician_rediagnoses_the_same_one(): void
    {
        $folio = $this->diagnose();

        $this->as($this->head, 'POST', "/api/v1/quotes/{$folio}/return", ['reason' => 'Revisa también el flex de carga'])
            ->assertOk()
            ->assertJsonPath('data.status', 'returned_to_technician');

        $this->assertSame(OrderStatus::idFor(OrderStatus::DIAGNOSING), $this->order->fresh()->status_id);

        $this->assertSame($folio, $this->diagnose()); // mismo presupuesto, no uno nuevo
        $this->assertSame(1, Quote::count());
        $this->assertSame('to_quote', Quote::first()->status);
    }

    public function test_customer_approves_from_the_portal_and_the_order_goes_to_repair(): void
    {
        $folio = $this->diagnose();
        $this->sendQuote($folio);

        $this->as($this->customer, 'GET', "/api/v1/portal/orders/{$this->order->folio}/quote")
            ->assertOk()
            ->assertJsonPath('data.total', 1300)
            ->assertJsonMissingPath('data.items.0.unit_cost')   // el cliente no ve costos
            ->assertJsonMissingPath('data.return_reason');

        $this->as($this->customer, 'POST', "/api/v1/portal/quotes/{$folio}/approve", ['comment' => 'Adelante, gracias'])
            ->assertOk()
            ->assertJsonPath('data.status', 'approved');

        $this->order->refresh();
        $this->assertSame(OrderStatus::idFor(OrderStatus::IN_REPAIR), $this->order->status_id);
        $this->assertEquals(480, $this->order->labor_cost);  // 580 − 100 de descuento
        $this->assertEquals(820, $this->order->parts_cost);
        $this->assertNotNull($this->order->approved_at);     // lo llena el trigger
        $this->assertDatabaseHas('order_logs', [
            'service_order_id' => $this->order->id, 'type' => 'customer_response', 'visible_to_customer' => true,
        ]);

        // RF-07: el técnico ve la orden en reparación en su banco
        $this->as($this->technician, 'GET', "/api/v1/my/orders/{$this->order->folio}")
            ->assertJsonPath('data.status.code', 'in_repair');
    }

    public function test_customer_rejects_and_only_the_inspection_is_charged(): void
    {
        $folio = $this->diagnose();
        $this->sendQuote($folio);

        $this->as($this->customer, 'POST', "/api/v1/portal/quotes/{$folio}/reject", ['comment' => 'Muy caro'])
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected');

        $this->assertSame(OrderStatus::idFor(OrderStatus::QUOTE_REJECTED), $this->order->fresh()->status_id);

        $this->as($this->customer, 'GET', "/api/v1/portal/orders/{$this->order->folio}")
            ->assertJsonPath('data.amount_due', 300); // costo de revisión
    }

    public function test_quote_can_only_be_answered_once_and_only_by_its_owner(): void
    {
        $folio = $this->diagnose();
        $this->sendQuote($folio);

        $this->as(Customer::factory()->create(), 'POST', "/api/v1/portal/quotes/{$folio}/approve")->assertStatus(404);

        $this->as($this->customer, 'POST', "/api/v1/portal/quotes/{$folio}/approve")->assertOk();
        $this->as($this->customer, 'POST', "/api/v1/portal/quotes/{$folio}/reject")
            ->assertStatus(422)
            ->assertJsonValidationErrors('status');
    }

    public function test_expired_quote_cannot_be_approved(): void
    {
        $folio = $this->diagnose();
        $this->sendQuote($folio);

        $this->travel(8)->days(); // vigencia por defecto: 7 días

        $this->as($this->customer, 'POST', "/api/v1/portal/quotes/{$folio}/approve")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['status' => 'El presupuesto venció. Comunícate con la sucursal para pedir uno nuevo.']);

        $this->assertSame('expired', Quote::first()->status);
    }

    public function test_head_releases_the_finished_device_and_the_customer_is_notified(): void
    {
        $folio = $this->diagnose();
        $this->sendQuote($folio);
        $this->as($this->customer, 'POST', "/api/v1/portal/quotes/{$folio}/approve");
        Mail::fake();

        $this->as($this->head, 'POST', "/api/v1/service-orders/{$this->order->folio}/release")
            ->assertOk()
            ->assertJsonPath('data.status.code', 'ready_for_pickup')
            ->assertJsonPath('data.balance.amount_due', 1300); // lo que cobrará la cajera

        $this->assertNotNull($this->order->fresh()->ready_at); // lo llena el trigger
        Mail::assertSent(OrderUpdateMail::class, fn ($mail) => $mail->title === '¡Tu equipo está listo!');
    }

    public function test_device_cannot_be_released_before_the_repair(): void
    {
        $folio = $this->diagnose();
        $this->sendQuote($folio);

        $this->as($this->head, 'POST', "/api/v1/service-orders/{$this->order->folio}/release")
            ->assertStatus(422)
            ->assertJsonValidationErrors('status');
    }

    public function test_technician_cannot_price_quotes(): void
    {
        $folio = $this->diagnose();

        $this->as($this->technician, 'POST', "/api/v1/quotes/{$folio}/send", ['items' => [['type' => 'labor', 'labor_level_id' => 2]]])
            ->assertStatus(403);
    }
}
