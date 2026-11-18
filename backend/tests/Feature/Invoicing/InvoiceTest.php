<?php

namespace Tests\Feature\Invoicing;

use App\Mail\InvoiceMail;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\User;
use App\Services\SettingsService;
use Database\Seeders\CatalogSeeder;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Facturación simulada (RF-16 · C3, AD6, P4.2). Precios con IVA incluido al 16 %.
 */
class InvoiceTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    private User $admin;

    private User $cashier;

    private Customer $customer;

    private int $next = 0;

    /** Datos fiscales válidos de una persona física (RFC de prueba del SAT). */
    private const FISCAL = [
        'rfc' => 'xojo010101abc', 'business_name' => 'Ana López Pérez', 'tax_regime' => '612',
        'postal_code' => '27000', 'cfdi_use' => 'G03',
    ];

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();
        $this->admin = User::factory()->admin()->create();
        $this->cashier = User::factory()->cashier()->create();
        $this->customer = Customer::factory()->create(['email' => 'ana@example.com']);
    }

    private function as(Authenticatable $account, string $method, string $uri, array $data = []): TestResponse
    {
        $this->app['auth']->forgetGuards();
        $ability = $account instanceof Customer ? 'customer' : 'staff';

        return $this->withToken($account->createToken('PC', [$ability])->plainTextToken)->json($method, $uri, $data);
    }

    /** Venta pagada de $total (IVA incluido) con un producto. */
    private function sale(float $total, ?Customer $customer = null, string $method = 'cash', string $paidAt = 'now'): Sale
    {
        $net = round($total / 1.16, 2);
        $sale = Sale::create([
            'folio' => sprintf('V-TEST-%05d', ++$this->next), 'cashier_id' => $this->cashier->id,
            'customer_id' => $customer?->id, 'subtotal' => $net, 'discount' => 0, 'tax' => round($total - $net, 2),
            'status' => 'paid', 'paid_at' => $paidAt === 'now' ? now() : $paidAt,
        ]);
        SaleItem::create(['sale_id' => $sale->id, 'type' => 'custom_item', 'description' => 'Mica de cristal', 'quantity' => 1, 'unit_price' => $total, 'subtotal' => $total]);
        Payment::create(['sale_id' => $sale->id, 'method' => $method, 'amount' => $total]);

        return $sale;
    }

    public function test_cashier_issues_an_individual_invoice_with_the_customer_fiscal_data(): void
    {
        $sale = $this->sale(116, $this->customer, 'card');

        $response = $this->as($this->cashier, 'POST', '/api/v1/invoices', ['sales' => [$sale->folio]] + self::FISCAL + ['save_profile' => true])
            ->assertCreated()
            ->assertJsonPath('data.folio', 'A-1')
            ->assertJsonPath('data.status', 'issued')
            ->assertJsonPath('data.is_simulated', true)
            ->assertJsonPath('data.receiver.rfc', 'XOJO010101ABC')
            ->assertJsonPath('data.receiver.business_name', 'ANA LÓPEZ PÉREZ')
            ->assertJsonPath('data.payment_form', '04')
            ->assertJsonPath('data.subtotal', 100)
            ->assertJsonPath('data.tax', 16)
            ->assertJsonPath('data.total', 116);

        $this->assertMatchesRegularExpression('/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/', $response->json('data.uuid'));
        $this->assertSame('invoice', $sale->fresh()->receipt_type);
        $this->assertDatabaseHas('customer_tax_profiles', ['customer_id' => $this->customer->id, 'rfc' => 'XOJO010101ABC', 'is_default' => true]);
        Mail::assertSent(InvoiceMail::class, fn (InvoiceMail $m) => $m->hasTo('ana@example.com') && str_ends_with($m->fileName, '_XOJO010101ABC.xml'));

        // Una venta facturada no se factura dos veces
        $this->as($this->cashier, 'POST', '/api/v1/invoices', ['sales' => [$sale->folio]] + self::FISCAL)
            ->assertUnprocessable()->assertJsonValidationErrors('sales.0');
    }

    public function test_the_xml_has_the_cfdi_structure_and_the_simulated_legend(): void
    {
        $sale = $this->sale(116, $this->customer);
        $id = $this->as($this->cashier, 'POST', '/api/v1/invoices', ['sales' => [$sale->folio]] + self::FISCAL)->json('data.id');

        $response = $this->as($this->cashier, 'GET', "/api/v1/invoices/{$id}/xml")->assertOk()->assertHeader('Content-Type', 'application/xml');
        $xml = $response->getContent();

        $this->assertStringContainsString('CFDI SIMULADO', $xml);
        $doc = simplexml_load_string($xml);
        $doc->registerXPathNamespace('cfdi', 'http://www.sat.gob.mx/cfd/4');
        $doc->registerXPathNamespace('tfd', 'http://www.sat.gob.mx/TimbreFiscalDigital');

        $this->assertSame('4.0', (string) $doc['Version']);
        $this->assertSame('116.00', (string) $doc['Total']);
        $this->assertSame('XOJO010101ABC', (string) $doc->xpath('//cfdi:Receptor')[0]['Rfc']);
        $this->assertSame('16.00', (string) $doc->xpath('//cfdi:Concepto//cfdi:Traslado')[0]['Importe']);
        $this->assertSame(Invoice::find($id)->sat_uuid, (string) $doc->xpath('//tfd:TimbreFiscalDigital')[0]['UUID']);
    }

    public function test_fiscal_data_is_validated(): void
    {
        $sale = $this->sale(116, $this->customer);

        $this->as($this->cashier, 'POST', '/api/v1/invoices', ['sales' => [$sale->folio]] + ['rfc' => 'ABC'] + self::FISCAL)
            ->assertUnprocessable()->assertJsonValidationErrors('rfc');

        // Régimen de persona moral (601) con un RFC de persona física
        $this->as($this->cashier, 'POST', '/api/v1/invoices', ['sales' => [$sale->folio], 'tax_regime' => '601'] + self::FISCAL)
            ->assertUnprocessable()->assertJsonValidationErrors('tax_regime');

        // El RFC genérico es para la factura global
        $this->as($this->cashier, 'POST', '/api/v1/invoices', ['sales' => [$sale->folio], 'rfc' => 'XAXX010101000', 'tax_regime' => '616'] + self::FISCAL)
            ->assertUnprocessable()->assertJsonValidationErrors('rfc');

        $this->assertDatabaseCount('invoices', 0);
    }

    public function test_global_invoice_takes_the_month_sales_that_nobody_invoiced(): void
    {
        $invoiced = $this->sale(116, $this->customer);
        $this->as($this->cashier, 'POST', '/api/v1/invoices', ['sales' => [$invoiced->folio]] + self::FISCAL)->assertCreated();

        $this->sale(232);
        $this->sale(58, method: 'transfer');
        $this->sale(116, paidAt: now()->subMonthNoOverflow()->toDateTimeString());

        $this->as($this->admin, 'POST', '/api/v1/invoices/global', ['period' => now()->format('Y-m')])
            ->assertCreated()
            ->assertJsonPath('data.type', 'global')
            ->assertJsonPath('data.receiver.rfc', 'XAXX010101000')
            ->assertJsonPath('data.receiver.cfdi_use', 'S01')
            ->assertJsonCount(2, 'data.sales')
            ->assertJsonPath('data.total', 290);

        $this->as($this->admin, 'POST', '/api/v1/invoices/global', ['period' => now()->format('Y-m')])
            ->assertUnprocessable()->assertJsonValidationErrors('period');
    }

    public function test_cancelling_frees_the_sales_and_replacing_relates_both_invoices(): void
    {
        $sale = $this->sale(116, $this->customer);
        $id = $this->as($this->cashier, 'POST', '/api/v1/invoices', ['sales' => [$sale->folio]] + self::FISCAL)->json('data.id');

        // Sustitución: el cliente dio mal el código postal
        $this->as($this->admin, 'POST', "/api/v1/invoices/{$id}/replace", ['postal_code' => '27010'])
            ->assertCreated()
            ->assertJsonPath('data.folio', 'A-2')
            ->assertJsonPath('data.receiver.postal_code', '27010')
            ->assertJsonPath('replaced.status', 'cancelled')
            ->assertJsonPath('replaced.cancellation_reason', '01')
            ->assertJsonPath('replaced.replaced_by', 'A-2');

        $newId = Invoice::where('number', 2)->value('id');
        $this->assertSame($newId, $sale->fresh()->invoice_id);

        // Cancelar sin relación: la venta queda libre para facturarse otra vez
        $this->as($this->admin, 'POST', "/api/v1/invoices/{$newId}/cancel", ['reason' => '01'])
            ->assertUnprocessable()->assertJsonValidationErrors('reason');
        $this->as($this->admin, 'POST', "/api/v1/invoices/{$newId}/cancel", ['reason' => '02'])
            ->assertOk()->assertJsonPath('data.status', 'cancelled');

        $this->assertNull($sale->fresh()->invoice_id);
        $this->as($this->admin, 'POST', "/api/v1/invoices/{$newId}/cancel", ['reason' => '02'])->assertUnprocessable();
    }

    public function test_customer_self_invoices_from_the_portal(): void
    {
        $mine = $this->sale(116, $this->customer);
        $other = $this->sale(116, Customer::factory()->create());

        $profileId = $this->as($this->customer, 'POST', '/api/v1/portal/tax-profiles', self::FISCAL + ['invoice_email' => 'facturas@ana.mx'])
            ->assertCreated()->json('data.id');

        $this->as($this->customer, 'GET', '/api/v1/portal/invoices')
            ->assertOk()
            ->assertJsonPath('invoiceable_sales.0.folio', $mine->folio)
            ->assertJsonCount(1, 'invoiceable_sales');

        // No puede facturar la compra de otra persona
        $this->as($this->customer, 'POST', '/api/v1/portal/invoices', ['sales' => [$other->folio], 'tax_profile_id' => $profileId])
            ->assertUnprocessable()->assertJsonValidationErrors('sales.0');

        $id = $this->as($this->customer, 'POST', '/api/v1/portal/invoices', ['sales' => [$mine->folio], 'tax_profile_id' => $profileId])
            ->assertCreated()
            ->assertJsonPath('data.origin', 'portal')
            ->json('data.id');

        Mail::assertSent(InvoiceMail::class, fn (InvoiceMail $m) => $m->hasTo('facturas@ana.mx'));
        $this->as($this->customer, 'GET', "/api/v1/portal/invoices/{$id}/xml")->assertOk();

        // Con la autofacturación apagada
        DB::table('settings')->where('key', 'self_invoicing_enabled')->update(['value' => '0']);
        app(SettingsService::class)->refresh();
        $this->as($this->customer, 'POST', '/api/v1/portal/invoices', ['sales' => [$mine->folio], 'tax_profile_id' => $profileId])
            ->assertForbidden();
    }

    public function test_no_invoices_without_stamps(): void
    {
        DB::table('settings')->where('key', 'stamps_purchased')->update(['value' => '0']);
        app(SettingsService::class)->refresh();

        $sale = $this->sale(116, $this->customer);

        $this->as($this->cashier, 'POST', '/api/v1/invoices', ['sales' => [$sale->folio]] + self::FISCAL)
            ->assertUnprocessable()->assertJsonValidationErrors('stamps');
    }

    public function test_permissions(): void
    {
        $technician = User::factory()->technician()->create();
        $sale = $this->sale(116, $this->customer);
        $id = $this->as($this->cashier, 'POST', '/api/v1/invoices', ['sales' => [$sale->folio]] + self::FISCAL)->json('data.id');

        $this->as($technician, 'GET', '/api/v1/invoices')->assertForbidden();
        // La cajera emite, pero cancelar y la factura global son del administrador
        $this->as($this->cashier, 'POST', "/api/v1/invoices/{$id}/cancel", ['reason' => '02'])->assertForbidden();
        $this->as($this->cashier, 'POST', '/api/v1/invoices/global', ['period' => now()->format('Y-m')])->assertForbidden();
        $this->as($this->admin, 'GET', '/api/v1/invoices')->assertOk()->assertJsonPath('stamps_remaining', 499);
    }
}
