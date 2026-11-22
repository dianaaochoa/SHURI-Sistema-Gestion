<?php

namespace Tests\Feature\Cash;

use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Datos que necesitan las pantallas de caja: quién tiene abierta cada caja (C1.7),
 * el desglose del corte (C10.1, C11) y la decisión del administrador al revisar (AD3.2).
 */
class CashShiftDetailsTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    private User $sofia;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        Notification::fake();
        $this->sofia = User::factory()->cashier()->create(['name' => 'Sofía Cajera', 'cash_register_id' => 1]);
        $this->admin = User::factory()->admin()->create();
    }

    private function as(User $user, string $method, string $uri, array $data = []): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($user->createToken('Caja', ['staff'])->plainTextToken)->json($method, $uri, $data);
    }

    public function test_registers_show_who_has_the_register_open(): void
    {
        $this->as($this->sofia, 'GET', '/api/v1/cash-registers')->assertJsonPath('data.0.open_shift', null);

        $this->as($this->sofia, 'POST', '/api/v1/cash-shifts')->assertCreated();

        $this->as($this->admin, 'GET', '/api/v1/cash-registers')
            ->assertJsonPath('data.0.open_shift.cashier.name', 'Sofía Cajera')
            ->assertJsonPath('data.0.open_shift.opening_amount', 1000);
    }

    public function test_summary_separates_product_sales_from_device_deliveries(): void
    {
        $id = $this->as($this->sofia, 'POST', '/api/v1/cash-shifts')->json('data.id');
        $producto = Product::create([
            'category_id' => Category::where('name', 'Accesorios')->value('id') ?? Category::value('id'),
            'sku' => 'MICA-01', 'name' => 'Mica de cristal', 'type' => 'accessory', 'purchase_price' => 40, 'sale_price' => 150, 'stock' => 5,
        ]);

        $this->as($this->sofia, 'POST', '/api/v1/sales', [
            'items' => [['type' => 'product', 'product_id' => $producto->id, 'quantity' => 2]],
            'payments' => [['method' => 'cash', 'amount' => 300]],
        ])->assertCreated();

        $this->as($this->sofia, 'POST', "/api/v1/cash-shifts/{$id}/movements", ['type' => 'cash_out', 'amount' => 100, 'reason' => 'Depósito'])->assertCreated();

        $this->as($this->sofia, 'GET', '/api/v1/cash-shifts/current')
            ->assertJsonPath('summary.sales_count', 1)
            ->assertJsonPath('summary.products_total', 300)
            ->assertJsonPath('summary.repairs_total', 0)
            ->assertJsonPath('summary.cash_out_count', 1)
            ->assertJsonPath('summary.expected_cash', 1200);

        // El historial de cortes trae el mismo resumen
        $this->as($this->sofia, 'GET', '/api/v1/cash-shifts')->assertJsonPath('data.0.summary.products_total', 300);
    }

    public function test_admin_review_decision_investigate_keeps_the_closing_pending(): void
    {
        $id = $this->as($this->sofia, 'POST', '/api/v1/cash-shifts')->json('data.id');
        $this->as($this->sofia, 'POST', "/api/v1/cash-shifts/{$id}/close", ['counted_cash' => 950])->assertOk();

        $this->as($this->admin, 'POST', "/api/v1/cash-shifts/{$id}/review", ['decision' => 'investigate', 'comment' => 'Revisar cámaras'])
            ->assertOk()
            ->assertJsonPath('data.status', 'closed')
            ->assertJsonPath('data.review_decision', 'investigate');

        // Ya investigado: se descuenta y el corte queda revisado
        $this->as($this->admin, 'POST', "/api/v1/cash-shifts/{$id}/review", ['decision' => 'deduct', 'comment' => 'Se descuenta de nómina'])
            ->assertOk()
            ->assertJsonPath('data.status', 'reviewed')
            ->assertJsonPath('data.review_decision', 'deduct')
            ->assertJsonPath('data.closed_by', 'Sofía Cajera');

        $this->as($this->admin, 'POST', "/api/v1/cash-shifts/{$id}/review", ['decision' => 'absorb'])->assertUnprocessable();
    }
}
