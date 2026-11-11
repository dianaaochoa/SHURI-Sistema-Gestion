<?php

namespace Tests\Feature\Pos;

use App\Models\CashShift;
use App\Models\Category;
use App\Models\Customer;
use App\Models\OrderStatus;
use App\Models\Product;
use App\Models\ServiceOrder;
use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Punto de venta y entrega de equipos (C2, C6 · RF-08, RF-14, RNF-04, prioridad 3 del MVP).
 */
class PosTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    private User $cashier;

    private User $admin;

    private CashShift $shift;

    protected function setUp(): void
    {
        parent::setUp();

        $this->cashier = User::factory()->cashier()->create(['cash_register_id' => 1, 'max_discount_pct' => 10]);
        $this->admin = User::factory()->admin()->create(['username' => 'vcastillo', 'authorization_code' => 'Autoriza123']);

        $this->shift = CashShift::create([
            'cash_register_id' => 1, 'user_id' => $this->cashier->id, 'opened_at' => now(),
            'opening_amount' => 1000, 'status' => 'open',
        ]);
    }

    private function product(array $attributes = []): Product
    {
        static $n = 0;
        $n++;

        return Product::create($attributes + [
            'category_id' => Category::where('name', 'Audífonos')->value('id'),
            'sku' => "AUD-{$n}",
            'name' => "Audífonos modelo {$n}",
            'type' => 'accessory',
            'purchase_price' => 400,
            'sale_price' => 900,
            'stock' => 5,
        ]);
    }

    private function order(string $status, array $attributes = []): ServiceOrder
    {
        static $n = 0;
        $n++;
        $customer = Customer::factory()->create();
        $device = $customer->devices()->create(['type' => 'Celular', 'brand' => 'Xiaomi', 'model' => 'Redmi 12']);

        return ServiceOrder::create($attributes + [
            'folio' => sprintf('OS-TEST-%05d', $n),
            'customer_id' => $customer->id,
            'device_id' => $device->id,
            'status_id' => OrderStatus::idFor($status),
            'reported_issue' => 'Pantalla rota.',
            'received_by' => $this->cashier->id,
        ]);
    }

    private function sell(array $payload, ?User $as = null): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken(($as ?? $this->cashier)->createToken('Caja', ['staff'])->plainTextToken)
            ->postJson('/api/v1/sales', $payload);
    }

    public function test_cashier_needs_an_open_shift_to_sell(): void
    {
        $this->shift->update(['status' => 'closed', 'closed_at' => now()]);
        $product = $this->product();

        $this->sell(['items' => [['type' => 'product', 'product_id' => $product->id]], 'payments' => [['method' => 'cash', 'amount' => 900]]])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['cash_shift' => 'Abre tu turno de caja antes de cobrar.']);
    }

    public function test_sells_products_with_cash_change_iva_and_stock_out(): void
    {
        $product = $this->product(['stock' => 5]);

        $response = $this->sell([
            'items' => [['type' => 'product', 'product_id' => $product->id, 'quantity' => 2]],
            'payments' => [['method' => 'cash', 'amount' => 1800, 'amount_received' => 2000]],
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'paid')
            ->assertJsonPath('data.total', 1800)
            ->assertJsonPath('data.tax', 248.28)          // IVA incluido en el precio (16 %)
            ->assertJsonPath('data.subtotal', 1551.72)
            ->assertJsonPath('data.change', 200)
            ->assertJsonPath('data.items.0.unit_price', 900);

        $this->assertMatchesRegularExpression('/^V-\d{4}-\d{5}$/', $response->json('data.folio'));
        $this->assertSame(3, $product->fresh()->stock);
        $this->assertDatabaseHas('inventory_movements', ['product_id' => $product->id, 'type' => 'sale', 'quantity' => -2]);
    }

    public function test_the_price_always_comes_from_the_catalog(): void
    {
        $product = $this->product(['sale_price' => 900]);

        $this->sell([
            'items' => [['type' => 'product', 'product_id' => $product->id, 'unit_price' => 1]],
            'payments' => [['method' => 'cash', 'amount' => 1]],
        ])->assertStatus(422)->assertJsonValidationErrors('payments');
    }

    public function test_payments_must_cover_the_total(): void
    {
        $product = $this->product();

        $this->sell([
            'items' => [['type' => 'product', 'product_id' => $product->id]],
            'payments' => [['method' => 'cash', 'amount' => 500]],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['payments' => 'Los pagos ($500.00) no cubren el total ($900.00).']);

        $this->assertSame(5, $product->fresh()->stock);
    }

    public function test_out_of_stock_rolls_back_the_whole_sale(): void
    {
        $inStock = $this->product(['stock' => 5]);
        $scarce = $this->product(['stock' => 1, 'name' => 'Cable USB-C']);

        $this->sell([
            'items' => [
                ['type' => 'product', 'product_id' => $inStock->id, 'quantity' => 1],
                ['type' => 'product', 'product_id' => $scarce->id, 'quantity' => 3],
            ],
            'payments' => [['method' => 'cash', 'amount' => 3600]],
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'INSUFFICIENT_STOCK');

        // RNF-04: nada quedó a medias
        $this->assertSame(5, $inStock->fresh()->stock);
        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('payments', 0);
        $this->assertDatabaseCount('inventory_movements', 0);
    }

    public function test_discount_within_the_cashier_limit_needs_no_authorization(): void
    {
        $product = $this->product(['sale_price' => 1000]);

        $this->sell([
            'items' => [['type' => 'product', 'product_id' => $product->id, 'discount_pct' => 10]],
            'payments' => [['method' => 'card', 'amount' => 900, 'card_last4' => '4242']],
        ])
            ->assertCreated()
            ->assertJsonPath('data.total', 900)
            ->assertJsonPath('data.authorized_by', null);
    }

    public function test_discount_above_the_limit_requires_a_superior_authorization(): void
    {
        $product = $this->product(['sale_price' => 1000]);
        $payload = [
            'items' => [['type' => 'product', 'product_id' => $product->id, 'discount_pct' => 15]],
            'payments' => [['method' => 'cash', 'amount' => 850]],
        ];

        $this->sell($payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['authorization' => 'El descuento de 15% supera tu máximo (10%). Pide la clave de autorización de un superior.']);

        $this->sell($payload + ['authorization' => ['username' => 'vcastillo', 'code' => 'Incorrecta']])
            ->assertStatus(422)
            ->assertJsonValidationErrors('authorization');

        $this->sell($payload + ['authorization' => ['username' => 'vcastillo', 'code' => 'Autoriza123']])
            ->assertCreated()
            ->assertJsonPath('data.total', 850)
            ->assertJsonPath('data.authorized_by', $this->admin->name);

        $this->assertDatabaseHas('audit_logs', ['action' => 'discount_authorized', 'user_id' => $this->admin->id]);
    }

    public function test_mixed_payment_cash_and_card(): void
    {
        $product = $this->product(['sale_price' => 1000]);

        $this->sell([
            'items' => [['type' => 'product', 'product_id' => $product->id]],
            'payments' => [
                ['method' => 'cash', 'amount' => 400, 'amount_received' => 500],
                ['method' => 'card', 'amount' => 600, 'card_last4' => '1111'],
            ],
        ])
            ->assertCreated()
            ->assertJsonCount(2, 'data.payments')
            ->assertJsonPath('data.change', 100);
    }

    public function test_delivering_a_repaired_order_charges_the_balance_and_marks_it_delivered(): void
    {
        $order = $this->order(OrderStatus::READY_FOR_PICKUP, ['labor_cost' => 580, 'parts_cost' => 720, 'deposit' => 300]);

        $this->sell([
            'items' => [['type' => 'service_order', 'folio' => $order->folio, 'picked_up_by_name' => 'Ana López']],
            'payments' => [['method' => 'cash', 'amount' => 1000]],
        ])
            ->assertCreated()
            ->assertJsonPath('data.total', 1000)
            ->assertJsonPath('data.customer.id', $order->customer_id)
            ->assertJsonPath('data.items.0.description', "Orden {$order->folio} · Celular Xiaomi Redmi 12");

        $order->refresh();
        $this->assertTrue($order->is_paid);
        $this->assertSame(OrderStatus::idFor(OrderStatus::DELIVERED), $order->status_id);
        $this->assertSame('Ana López', $order->picked_up_by_name);
        $this->assertNotNull($order->delivered_at);   // lo llena el trigger
        $this->assertNotNull($order->warranty_until); // garantía calculada por el trigger
        $this->assertDatabaseHas('order_logs', ['service_order_id' => $order->id, 'new_status_id' => OrderStatus::idFor(OrderStatus::DELIVERED)]);
    }

    public function test_not_repairable_order_charges_the_inspection_fee(): void
    {
        $order = $this->order(OrderStatus::NOT_REPAIRABLE);

        $this->sell([
            'items' => [['type' => 'service_order', 'folio' => $order->folio]],
            'payments' => [['method' => 'cash', 'amount' => 300]],
        ])->assertCreated()->assertJsonPath('data.total', 300);
    }

    public function test_order_balance_is_shown_before_charging(): void
    {
        $order = $this->order(OrderStatus::READY_FOR_PICKUP, ['labor_cost' => 500, 'deposit' => 200]);
        $this->app['auth']->forgetGuards();

        $this->withToken($this->cashier->createToken('Caja', ['staff'])->plainTextToken)
            ->getJson("/api/v1/service-orders/{$order->folio}")
            ->assertJsonPath('data.balance.amount_due', 300);
    }

    public function test_orders_still_in_the_workshop_or_already_paid_cannot_be_delivered(): void
    {
        $inRepair = $this->order(OrderStatus::DIAGNOSING);
        $paid = $this->order(OrderStatus::READY_FOR_PICKUP, ['is_paid' => true]);

        foreach ([$inRepair, $paid] as $order) {
            $this->sell([
                'items' => [['type' => 'service_order', 'folio' => $order->folio]],
                'payments' => [['method' => 'cash', 'amount' => 100]],
            ])->assertStatus(422)->assertJsonValidationErrors('items.0.folio');
        }
    }

    public function test_cash_sales_appear_in_the_shift_summary(): void
    {
        $product = $this->product(['sale_price' => 500]);
        $this->sell([
            'items' => [['type' => 'product', 'product_id' => $product->id]],
            'payments' => [['method' => 'cash', 'amount' => 500]],
        ])->assertCreated();

        $this->app['auth']->forgetGuards();
        $this->withToken($this->cashier->createToken('Caja', ['staff'])->plainTextToken)
            ->getJson('/api/v1/cash-shifts/current')
            ->assertJsonPath('summary.cash_sales', 500)
            ->assertJsonPath('summary.expected_cash', 1500);
    }

    public function test_technician_cannot_sell(): void
    {
        $this->sell(['items' => [['type' => 'product', 'product_id' => 1]]], User::factory()->technician()->create())
            ->assertStatus(403);
    }

    public function test_cashier_lists_and_opens_her_sales(): void
    {
        $product = $this->product();
        $folio = $this->sell([
            'items' => [['type' => 'product', 'product_id' => $product->id]],
            'payments' => [['method' => 'transfer', 'amount' => 900, 'reference' => 'SPEI-123']],
        ])->json('data.folio');

        $this->app['auth']->forgetGuards();
        $token = $this->cashier->createToken('Caja', ['staff'])->plainTextToken;

        $this->withToken($token)->getJson('/api/v1/sales')->assertJsonCount(1, 'data');
        $this->withToken($token)->getJson("/api/v1/sales/{$folio}")
            ->assertOk()
            ->assertJsonPath('data.payments.0.method_name', 'Transferencia');
    }
}
