<?php

namespace Tests\Feature\Purchasing;

use App\Models\Category;
use App\Models\Customer;
use App\Models\OrderStatus;
use App\Models\PartRequest;
use App\Models\Product;
use App\Models\ServiceOrder;
use App\Models\Supplier;
use App\Models\User;
use App\Notifications\PartArrivedNotification;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Compras a proveedores (RF-15 · AD5, J5, C7): pedidos, recepción, compras y pagos.
 */
class PurchaseTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    private User $admin;

    private User $head;

    private User $cashier;

    private User $technician;

    private Supplier $supplier;

    private Product $screen;

    private ServiceOrder $order;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->admin()->create();
        $this->head = User::factory()->headTechnician()->create();
        $this->cashier = User::factory()->cashier()->create();
        $this->technician = User::factory()->technician()->create();

        $this->supplier = Supplier::create(['name' => 'Refacciones del Norte', 'credit_days' => 15]);
        $this->screen = Product::create([
            'category_id' => Category::where('name', 'Pantallas')->value('id') ?? Category::value('id'),
            'sku' => 'PAN-A52', 'name' => 'Pantalla Samsung A52', 'type' => 'part',
            'purchase_price' => 600, 'sale_price' => 1200, 'stock' => 0,
        ]);

        $customer = Customer::factory()->create();
        $device = $customer->devices()->create(['type' => 'Celular', 'brand' => 'Samsung', 'model' => 'A52']);
        $this->order = ServiceOrder::create([
            'folio' => 'OS-TEST-00001', 'customer_id' => $customer->id, 'device_id' => $device->id,
            'status_id' => OrderStatus::idFor(OrderStatus::IN_REPAIR), 'technician_id' => $this->technician->id,
            'reported_issue' => 'Pantalla rota.', 'received_by' => $this->head->id,
        ]);
    }

    private function as(User $user, string $method, string $uri, array $data = []): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($user->createToken('PC', ['staff'])->plainTextToken)->json($method, $uri, $data);
    }

    /** El técnico pide la pantalla que no hay en stock y devuelve el folio de la solicitud. */
    private function requestScreen(int $quantity = 2): string
    {
        return $this->as($this->technician, 'POST', "/api/v1/my/orders/{$this->order->folio}/part-requests", [
            'product_id' => $this->screen->id, 'quantity' => $quantity,
        ])->assertCreated()->json('data.folio');
    }

    /** Pedido creado y enviado; devuelve el folio y el id del renglón. */
    private function sentOrder(string $requestFolio): array
    {
        $response = $this->as($this->head, 'POST', '/api/v1/purchase-orders', [
            'supplier_id' => $this->supplier->id, 'part_requests' => [$requestFolio],
        ])->assertCreated();

        $folio = $response->json('data.folio');
        $this->as($this->head, 'POST', "/api/v1/purchase-orders/{$folio}/send", ['supplier_folio' => 'RN-778'])->assertOk();

        return [$folio, $response->json('data.items.0.id')];
    }

    public function test_head_groups_part_requests_into_an_order_and_sending_marks_them_ordered(): void
    {
        $requestFolio = $this->requestScreen();

        $response = $this->as($this->head, 'POST', '/api/v1/purchase-orders', [
            'supplier_id' => $this->supplier->id,
            'part_requests' => [$requestFolio],
            'items' => [['description' => 'Flex de carga genérico', 'quantity' => 3, 'unit_cost' => 40]],
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.items.0.description', 'Pantalla Samsung A52')
            ->assertJsonPath('data.items.0.pending_quantity', 2)
            ->assertJsonPath('data.estimated_total', 1320);

        $folio = $response->json('data.folio');
        $this->assertMatchesRegularExpression('/^PP-\d{4}-\d{5}$/', $folio);

        $this->as($this->head, 'POST', "/api/v1/purchase-orders/{$folio}/send", ['supplier_folio' => 'RN-778'])
            ->assertOk()
            ->assertJsonPath('data.status', 'sent')
            ->assertJsonPath('data.supplier_folio', 'RN-778');

        $this->assertSame('ordered', PartRequest::where('folio', $requestFolio)->value('status'));
    }

    public function test_a_request_already_ordered_cannot_go_into_another_order(): void
    {
        $requestFolio = $this->requestScreen();
        $this->sentOrder($requestFolio);

        $this->as($this->head, 'POST', '/api/v1/purchase-orders', [
            'supplier_id' => $this->supplier->id, 'part_requests' => [$requestFolio],
        ])->assertUnprocessable()->assertJsonValidationErrors('part_requests.0');
    }

    public function test_partial_reception_raises_stock_and_full_reception_frees_the_request(): void
    {
        Notification::fake();
        $requestFolio = $this->requestScreen(2);
        [$folio, $itemId] = $this->sentOrder($requestFolio);

        // Llega 1 de 2 con un costo nuevo
        $this->as($this->cashier, 'POST', "/api/v1/purchase-orders/{$folio}/receive", [
            'supplier_invoice' => 'FAC-1001',
            'items' => [['item_id' => $itemId, 'quantity' => 1, 'unit_cost' => 650]],
        ])
            ->assertCreated()
            ->assertJsonPath('data.total', 650)
            ->assertJsonPath('data.payment_status', 'pending')
            ->assertJsonPath('purchase_order.status', 'partially_received')
            ->assertJsonPath('purchase_order.items.0.pending_quantity', 1);

        $this->assertSame(1, $this->screen->fresh()->stock);
        $this->assertSame(650.0, (float) $this->screen->fresh()->purchase_price);
        $this->assertDatabaseHas('price_histories', ['product_id' => $this->screen->id, 'new_purchase_price' => 650]);
        $this->assertDatabaseHas('inventory_movements', ['product_id' => $this->screen->id, 'type' => 'stock_in', 'quantity' => 1]);

        // Llega el resto
        $this->as($this->cashier, 'POST', "/api/v1/purchase-orders/{$folio}/receive", [
            'items' => [['item_id' => $itemId, 'quantity' => 1]],
        ])->assertCreated()->assertJsonPath('purchase_order.status', 'received');

        $this->assertSame(2, $this->screen->fresh()->stock);
        $this->assertSame('pending', PartRequest::where('folio', $requestFolio)->value('status'));
        Notification::assertSentTo($this->technician, PartArrivedNotification::class);

        // El jefe ya puede entregarla al técnico
        $this->as($this->head, 'POST', "/api/v1/part-requests/{$requestFolio}/deliver")->assertOk();
        $this->assertSame(0, $this->screen->fresh()->stock);
    }

    public function test_cannot_receive_more_than_what_is_pending(): void
    {
        [$folio, $itemId] = $this->sentOrder($this->requestScreen(2));

        $this->as($this->cashier, 'POST', "/api/v1/purchase-orders/{$folio}/receive", [
            'items' => [['item_id' => $itemId, 'quantity' => 3]],
        ])->assertUnprocessable()->assertJsonValidationErrors('items.0.quantity');

        $this->assertSame(0, $this->screen->fresh()->stock);
    }

    public function test_a_draft_order_cannot_be_received_and_cancelling_frees_the_requests(): void
    {
        $requestFolio = $this->requestScreen();
        [$folio, $itemId] = $this->sentOrder($requestFolio);

        $this->as($this->head, 'POST', "/api/v1/purchase-orders/{$folio}/cancel")
            ->assertOk()->assertJsonPath('data.status', 'cancelled');

        $this->assertSame('pending', PartRequest::where('folio', $requestFolio)->value('status'));

        $this->as($this->cashier, 'POST', "/api/v1/purchase-orders/{$folio}/receive", [
            'items' => [['item_id' => $itemId, 'quantity' => 1]],
        ])->assertUnprocessable()->assertJsonValidationErrors('status');
    }

    public function test_direct_purchase_with_invoice_raises_stock(): void
    {
        $response = $this->as($this->cashier, 'POST', '/api/v1/purchases', [
            'supplier_id' => $this->supplier->id,
            'supplier_invoice' => 'FAC-2002',
            'tax' => 192,
            'items' => [['product_id' => $this->screen->id, 'quantity' => 2]],
        ])
            ->assertCreated()
            ->assertJsonPath('data.subtotal', 1200)
            ->assertJsonPath('data.total', 1392)
            ->assertJsonPath('data.balance', 1392)
            ->assertJsonPath('data.items.0.product', 'Pantalla Samsung A52');

        $this->assertMatchesRegularExpression('/^C-\d{4}-\d{5}$/', $response->json('data.folio'));
        $this->assertSame(2, $this->screen->fresh()->stock);
        // Mismo costo: no se agrega al historial de precios
        $this->assertDatabaseMissing('price_histories', ['product_id' => $this->screen->id]);
    }

    public function test_admin_pays_a_purchase_in_parts(): void
    {
        $folio = $this->as($this->cashier, 'POST', '/api/v1/purchases', [
            'supplier_id' => $this->supplier->id,
            'items' => [['product_id' => $this->screen->id, 'quantity' => 1]],
        ])->json('data.folio');

        $this->as($this->admin, 'GET', '/api/v1/suppliers')->assertOk()->assertJsonPath('data.0.debt', 600);

        $this->as($this->admin, 'POST', "/api/v1/purchases/{$folio}/payments", ['method' => 'transfer', 'amount' => 700])
            ->assertUnprocessable()->assertJsonValidationErrors('amount');

        $this->as($this->admin, 'POST', "/api/v1/purchases/{$folio}/payments", ['method' => 'transfer', 'amount' => 400, 'reference' => 'SPEI 123'])
            ->assertCreated()
            ->assertJsonPath('data.payment_status', 'partial')
            ->assertJsonPath('data.balance', 200);

        $this->as($this->admin, 'POST', "/api/v1/purchases/{$folio}/payments", ['method' => 'transfer', 'amount' => 200])
            ->assertCreated()
            ->assertJsonPath('data.payment_status', 'paid')
            ->assertJsonCount(2, 'data.payments');

        $this->as($this->admin, 'GET', '/api/v1/purchases?payment_status=pending')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_cash_payment_needs_an_open_shift(): void
    {
        $folio = $this->as($this->cashier, 'POST', '/api/v1/purchases', [
            'supplier_id' => $this->supplier->id,
            'items' => [['product_id' => $this->screen->id, 'quantity' => 1]],
        ])->json('data.folio');

        $this->as($this->admin, 'POST', "/api/v1/purchases/{$folio}/payments", ['method' => 'cash', 'amount' => 100])
            ->assertUnprocessable()->assertJsonValidationErrors('method');

        $shiftId = $this->as($this->admin, 'POST', '/api/v1/cash-shifts', ['cash_register_id' => 1])->assertCreated()->json('data.id');

        $this->as($this->admin, 'POST', "/api/v1/purchases/{$folio}/payments", ['method' => 'cash', 'amount' => 100])->assertCreated();
        $this->assertDatabaseHas('supplier_payments', ['cash_shift_id' => $shiftId, 'method' => 'cash', 'amount' => 100]);
    }

    public function test_admin_manages_suppliers(): void
    {
        $id = $this->as($this->admin, 'POST', '/api/v1/suppliers', ['name' => 'Partes Express', 'rfc' => 'pex010101ab1', 'credit_days' => 30])
            ->assertCreated()
            ->assertJsonPath('data.rfc', 'PEX010101AB1')
            ->json('data.id');

        $this->as($this->admin, 'POST', '/api/v1/suppliers', ['name' => 'Partes Express'])
            ->assertUnprocessable()->assertJsonValidationErrors('name');

        $this->as($this->admin, 'PUT', "/api/v1/suppliers/{$id}", ['is_active' => false])
            ->assertOk()->assertJsonPath('data.is_active', false);

        // Un proveedor inactivo no recibe pedidos nuevos
        $this->as($this->head, 'POST', '/api/v1/purchase-orders', [
            'supplier_id' => $id, 'items' => [['product_id' => $this->screen->id, 'quantity' => 1]],
        ])->assertUnprocessable()->assertJsonValidationErrors('supplier_id');
    }

    public function test_permissions_by_role(): void
    {
        // Técnico: nada de compras
        $this->as($this->technician, 'GET', '/api/v1/purchase-orders')->assertForbidden();
        // Cajera: recibe, pero no crea pedidos ni paga
        $this->as($this->cashier, 'POST', '/api/v1/purchase-orders', ['supplier_id' => $this->supplier->id])->assertForbidden();
        $this->as($this->cashier, 'POST', '/api/v1/purchases/C-2026-00001/payments', ['method' => 'transfer', 'amount' => 1])->assertForbidden();
        // Jefe: pide, pero no administra proveedores
        $this->as($this->head, 'POST', '/api/v1/suppliers', ['name' => 'Otro'])->assertForbidden();
        $this->as($this->head, 'GET', '/api/v1/suppliers')->assertOk();
    }
}
