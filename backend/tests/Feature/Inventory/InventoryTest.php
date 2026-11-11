<?php

namespace Tests\Feature\Inventory;

use App\Exceptions\InsufficientStockException;
use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use App\Notifications\LowStockNotification;
use App\Services\Inventory\InventoryService;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Inventario unificado (RF-02, T-03): catálogo, kardex, entradas, ajustes y stock mínimo.
 */
class InventoryTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    private User $admin;

    private User $cashier;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->admin()->create();
        $this->cashier = User::factory()->cashier()->create();
    }

    /** Las categorías se buscan por nombre: su id cambia entre pruebas (autoincremento de MySQL). */
    private function category(string $name): int
    {
        return Category::where('name', $name)->value('id');
    }

    private function product(array $attributes = []): Product
    {
        static $n = 0;
        $n++;

        return Product::create($attributes + [
            'category_id' => $this->category('Pantallas'),
            'sku' => "PAN-{$n}",
            'name' => "Pantalla Samsung A{$n}",
            'type' => 'part',
            'purchase_price' => 450,
            'sale_price' => 900,
            'stock' => 10,
            'min_stock' => 2,
        ]);
    }

    private function as(User $user, string $method, string $uri, array $data = []): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($user->createToken('PC', ['staff'])->plainTextToken)->json($method, $uri, $data);
    }

    public function test_cashier_registers_a_product_with_initial_stock(): void
    {
        $this->as($this->cashier, 'POST', '/api/v1/products', [
            'category_id' => $this->category('Audífonos'),
            'sku' => 'aud-jbl-01',
            'barcode' => '7501234567890',
            'name' => 'Audífonos JBL Tune 510',
            'type' => 'accessory',
            'purchase_price' => 520,
            'sale_price' => 899,
            'min_stock' => 2,
            'initial_stock' => 5,
        ])
            ->assertCreated()
            ->assertJsonPath('data.sku', 'AUD-JBL-01')
            ->assertJsonPath('data.stock', 5)
            ->assertJsonMissingPath('data.purchase_price'); // la cajera no ve costos

        $product = Product::where('sku', 'AUD-JBL-01')->firstOrFail();
        $this->assertDatabaseHas('inventory_movements', [
            'product_id' => $product->id, 'type' => 'stock_in', 'quantity' => 5, 'previous_stock' => 0, 'new_stock' => 5,
        ]);
    }

    public function test_sku_and_barcode_must_be_unique(): void
    {
        $this->product(['sku' => 'BAT-01', 'barcode' => '111']);

        $this->as($this->admin, 'POST', '/api/v1/products', [
            'category_id' => $this->category('Baterías'), 'sku' => 'bat-01', 'barcode' => '111', 'name' => 'Batería',
            'type' => 'part', 'purchase_price' => 1, 'sale_price' => 2,
        ])->assertStatus(422)->assertJsonValidationErrors(['sku', 'barcode']);
    }

    public function test_stock_in_adds_stock_and_writes_the_kardex(): void
    {
        $product = $this->product(['stock' => 3]);

        $this->as($this->cashier, 'POST', '/api/v1/inventory/stock-in', [
            'product_id' => $product->id, 'quantity' => 7, 'reason' => 'Compra de contado',
        ])
            ->assertCreated()
            ->assertJsonPath('movement.type_name', 'Entrada')
            ->assertJsonPath('movement.previous_stock', 3)
            ->assertJsonPath('movement.new_stock', 10)
            ->assertJsonPath('product.stock', 10);
    }

    public function test_adjustment_sets_the_counted_stock_and_can_be_marked_as_shrinkage(): void
    {
        $product = $this->product(['stock' => 10]);

        $this->as($this->cashier, 'POST', '/api/v1/inventory/adjustments', [
            'product_id' => $product->id, 'counted_stock' => 8, 'reason' => 'Conteo mensual: 2 piezas dañadas', 'is_shrinkage' => true,
        ])
            ->assertCreated()
            ->assertJsonPath('movement.type', 'shrinkage')
            ->assertJsonPath('movement.quantity', -2)
            ->assertJsonPath('product.stock', 8);

        $this->assertDatabaseHas('audit_logs', ['action' => 'stock_adjusted', 'user_id' => $this->cashier->id]);
    }

    public function test_adjustment_requires_a_reason_and_a_real_difference(): void
    {
        $product = $this->product(['stock' => 4]);

        $this->as($this->cashier, 'POST', '/api/v1/inventory/adjustments', ['product_id' => $product->id, 'counted_stock' => 3])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['reason' => 'El campo motivo del ajuste es obligatorio.']);

        $this->as($this->cashier, 'POST', '/api/v1/inventory/adjustments', ['product_id' => $product->id, 'counted_stock' => 4, 'reason' => 'Conteo'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('counted_stock');
    }

    public function test_stock_can_never_go_below_zero(): void
    {
        $product = $this->product(['stock' => 2]);

        try {
            app(InventoryService::class)->move($product->id, 'sale', -3, $this->cashier, 'Venta');
            $this->fail('Debió rechazar la salida');
        } catch (InsufficientStockException $e) {
            $this->assertSame(2, $e->available);
            $this->assertSame(3, $e->requested);
        }

        // Nada cambió: ni el stock ni el kardex (RNF-04)
        $this->assertSame(2, $product->fresh()->stock);
        $this->assertDatabaseCount('inventory_movements', 0);
    }

    public function test_price_changes_are_kept_in_the_price_history(): void
    {
        $product = $this->product();

        $this->as($this->admin, 'PUT', "/api/v1/products/{$product->id}", [
            'sale_price' => 950, 'price_change_reason' => 'Aumento del proveedor',
        ])
            ->assertOk()
            ->assertJsonPath('data.sale_price', 950)
            ->assertJsonPath('data.margin', 500);

        $this->assertDatabaseHas('price_histories', [
            'product_id' => $product->id, 'old_sale_price' => 900, 'new_sale_price' => 950, 'reason' => 'Aumento del proveedor',
        ]);
    }

    public function test_stock_cannot_be_edited_directly(): void
    {
        $product = $this->product(['stock' => 10]);

        $this->as($this->admin, 'PUT', "/api/v1/products/{$product->id}", ['stock' => 99, 'name' => 'Pantalla editada'])->assertOk();

        $this->assertSame(10, $product->fresh()->stock);
    }

    public function test_only_users_with_catalog_prices_can_edit_products(): void
    {
        $product = $this->product();

        $this->as($this->cashier, 'PUT', "/api/v1/products/{$product->id}", ['sale_price' => 1])->assertStatus(403);
    }

    public function test_crossing_the_minimum_stock_notifies_admin_and_head_once(): void
    {
        Notification::fake();
        $head = User::factory()->headTechnician()->create();
        $product = $this->product(['stock' => 5, 'min_stock' => 3]);
        $service = app(InventoryService::class);

        $service->move($product->id, 'sale', -3, $this->cashier, 'Venta'); // 5 → 2, cruza el mínimo
        $service->move($product->id, 'sale', -1, $this->cashier, 'Venta'); // 2 → 1, ya estaba abajo

        Notification::assertSentTo([$this->admin, $head], LowStockNotification::class);
        Notification::assertSentTimes(LowStockNotification::class, 2); // una por destinatario, no por venta
        Notification::assertNotSentTo($this->cashier, LowStockNotification::class);
    }

    public function test_staff_reads_low_stock_notifications(): void
    {
        $product = $this->product(['stock' => 3, 'min_stock' => 2, 'name' => 'Batería iPhone 11']);
        app(InventoryService::class)->move($product->id, 'sale', -3, $this->cashier, 'Venta');

        $this->as($this->admin, 'GET', '/api/v1/notifications')
            ->assertOk()
            ->assertJsonPath('unread', 1)
            ->assertJsonPath('data.0.data.message', 'Se agotó «Batería iPhone 11».');

        $this->as($this->admin, 'POST', '/api/v1/notifications/read-all')->assertOk();
        $this->as($this->admin, 'GET', '/api/v1/notifications')->assertJsonPath('unread', 0);
    }

    public function test_catalog_search_filters_and_cost_visibility(): void
    {
        $this->product(['sku' => 'PAN-A54', 'barcode' => '750000000054', 'name' => 'Pantalla Galaxy A54']);
        $this->product(['sku' => 'BAT-11', 'name' => 'Batería iPhone 11', 'category_id' => $this->category('Baterías'), 'stock' => 1, 'min_stock' => 2]);

        $this->as($this->cashier, 'GET', '/api/v1/products?search=750000000054')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.sku', 'PAN-A54');

        $this->as($this->cashier, 'GET', '/api/v1/products?low_stock=1')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.is_low_stock', true);

        $technician = User::factory()->technician()->create();
        $this->as($technician, 'GET', '/api/v1/products?search=Galaxy')->assertJsonMissingPath('data.0.purchase_price');
        $this->as($this->admin, 'GET', '/api/v1/products?search=Galaxy')->assertJsonPath('data.0.purchase_price', 450);
    }

    public function test_kardex_lists_movements_of_a_product(): void
    {
        $product = $this->product(['stock' => 0]);
        $service = app(InventoryService::class);
        $service->stockIn($product->id, 5, $this->cashier, 'Entrada');
        $service->move($product->id, 'sale', -2, $this->cashier, 'Venta');

        $this->as($this->cashier, 'GET', "/api/v1/inventory/movements?product_id={$product->id}")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.type_name', 'Venta')
            ->assertJsonPath('data.0.new_stock', 3);

        $this->as($this->cashier, 'GET', "/api/v1/products/{$product->id}")
            ->assertOk()
            ->assertJsonCount(2, 'recent_movements');
    }

    public function test_technician_can_view_but_not_stock_in(): void
    {
        $technician = User::factory()->technician()->create();
        $product = $this->product();

        $this->as($technician, 'GET', '/api/v1/products')->assertOk();
        $this->as($technician, 'POST', '/api/v1/inventory/stock-in', ['product_id' => $product->id, 'quantity' => 1])->assertStatus(403);
    }

    public function test_categories_catalog(): void
    {
        $this->as($this->cashier, 'GET', '/api/v1/categories')
            ->assertOk()
            ->assertJsonCount(10, 'data');
    }
}
