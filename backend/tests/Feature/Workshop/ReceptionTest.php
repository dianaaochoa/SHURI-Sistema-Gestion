<?php

namespace Tests\Feature\Workshop;

use App\Mail\OrderRegisteredMail;
use App\Models\Customer;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Services\FolioService;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class ReceptionTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    private User $cashier;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();
        $this->cashier = User::factory()->cashier()->create(['cash_register_id' => 1]);
    }

    /** @param  array<string, mixed>  $overrides */
    private function newOrderPayload(array $overrides = []): array
    {
        return array_replace_recursive([
            'customer' => [
                'name' => 'Ana',
                'last_name' => 'López',
                'phone' => '871 123 4567',
                'email' => 'Ana@Correo.com',
            ],
            'device' => [
                'type' => 'Celular',
                'brand' => 'Samsung',
                'model' => 'Galaxy A54',
                'serial_number' => '356789104512345',
                'color' => 'Negro',
            ],
            'reported_issue' => 'No enciende después de mojarse.',
            'received_accessories' => 'Funda',
            'physical_condition' => 'Pantalla con rayones',
            'device_pin' => '1234',
            'priority' => 'high',
        ], $overrides);
    }

    private function receive(array $payload, ?User $as = null): TestResponse
    {
        $user = $as ?? $this->cashier;
        $this->app['auth']->forgetGuards();

        return $this->withToken($user->createToken('Caja 1', ['staff'])->plainTextToken)
            ->postJson('/api/v1/service-orders', $payload);
    }

    public function test_cashier_receives_a_device_of_a_new_customer(): void
    {
        $year = now()->year;

        $response = $this->receive($this->newOrderPayload())
            ->assertCreated()
            ->assertJsonPath('data.folio', "OS-{$year}-00001")
            ->assertJsonPath('data.status.code', 'received')
            ->assertJsonPath('data.customer.email', 'ana@correo.com')
            ->assertJsonPath('data.customer.phone', '8711234567')
            ->assertJsonPath('data.device.label', 'Celular Samsung Galaxy A54')
            ->assertJsonPath('data.technician', null)
            ->assertJsonPath('data.has_device_pin', true)
            ->assertJsonPath('portal_access.email', 'ana@correo.com')
            ->assertJsonPath('email_sent', true);

        $order = ServiceOrder::firstOrFail();
        $this->assertSame($this->cashier->id, $order->received_by);
        $this->assertSame(1, $order->cash_register_id);
        $this->assertNotNull($order->diagnosis_due_at);

        // Portal access (RF-06): hashed for login, encrypted to reprint, never plain
        $customer = Customer::firstOrFail();
        $temporary = $response->json('portal_access.temporary_password');
        $this->assertTrue($customer->must_change_password);
        $this->assertTrue(Hash::check($temporary, $customer->password));
        $this->assertSame($temporary, $customer->temporary_password_encrypted);
        $this->assertNotSame($temporary, DB::table('customers')->value('temporary_password_encrypted'));
    }

    public function test_reception_email_has_folio_and_portal_access(): void
    {
        $temporary = $this->receive($this->newOrderPayload())->json('portal_access.temporary_password');

        Mail::assertSent(OrderRegisteredMail::class, fn (OrderRegisteredMail $mail) => $mail->hasTo('ana@correo.com')
            && $mail->folio === ServiceOrder::first()->folio
            && $mail->temporaryPassword === $temporary);
        $this->assertDatabaseHas('sent_emails', ['type' => 'order_registered', 'status' => 'sent']);
    }

    public function test_reception_is_written_to_the_order_log_by_the_observer(): void
    {
        $this->receive($this->newOrderPayload())->assertCreated();

        $this->assertDatabaseHas('order_logs', [
            'service_order_id' => ServiceOrder::first()->id,
            'type' => 'intake',
            'user_id' => $this->cashier->id,
            'visible_to_customer' => true,
        ]);
    }

    public function test_folios_are_consecutive(): void
    {
        $year = now()->year;
        $this->receive($this->newOrderPayload())->assertCreated();

        $this->receive($this->newOrderPayload(['customer' => ['phone' => '8710000000', 'email' => 'otro@correo.com']]))
            ->assertCreated()
            ->assertJsonPath('data.folio', "OS-{$year}-00002");
    }

    public function test_device_pin_is_stored_encrypted(): void
    {
        $this->receive($this->newOrderPayload())->assertCreated();

        $this->assertNotSame('1234', DB::table('service_orders')->value('device_pin'));
        $this->assertSame('1234', ServiceOrder::first()->device_pin);
    }

    public function test_returning_customer_with_own_password_gets_no_new_temporary_password(): void
    {
        $customer = Customer::factory()->create();
        $device = $customer->devices()->create(['type' => 'Laptop', 'brand' => 'HP']);

        $this->receive([
            'customer_id' => $customer->id,
            'device' => ['id' => $device->id],
            'reported_issue' => 'Teclado no responde.',
        ])
            ->assertCreated()
            ->assertJsonPath('portal_access', null)
            ->assertJsonPath('data.device.id', $device->id);

        $this->assertTrue(Hash::check('Password123', $customer->fresh()->password));
        Mail::assertSent(OrderRegisteredMail::class, fn ($mail) => $mail->temporaryPassword === null);
    }

    public function test_device_must_belong_to_the_customer(): void
    {
        $customer = Customer::factory()->create();
        $other = Customer::factory()->create();
        $device = $other->devices()->create(['type' => 'Laptop', 'brand' => 'HP']);

        $this->receive([
            'customer_id' => $customer->id,
            'device' => ['id' => $device->id],
            'reported_issue' => 'No carga.',
        ])->assertStatus(422)->assertJsonValidationErrors('device.id');

        $this->assertDatabaseCount('service_orders', 0);
    }

    public function test_new_customer_phone_and_email_must_be_unique(): void
    {
        Customer::factory()->create(['phone' => '8711234567', 'email' => 'ana@correo.com']);

        $this->receive($this->newOrderPayload())
            ->assertStatus(422)
            ->assertJsonValidationErrors([
                'customer.phone',
                'customer.email' => 'El correo ya está registrado.',
            ]);
    }

    public function test_required_fields_are_validated_in_spanish(): void
    {
        $this->receive(['device' => []])
            ->assertStatus(422)
            ->assertJsonPath('errors.reported_issue.0', 'El campo falla reportada es obligatorio.')
            ->assertJsonValidationErrors(['customer_id', 'device', 'reported_issue']);
    }

    public function test_nothing_is_saved_if_reception_fails_midway(): void
    {
        // The folio fails after the customer and device were already inserted
        $this->mock(FolioService::class, fn ($mock) => $mock->shouldReceive('next')->andThrow(new \RuntimeException('sin folio')));

        $this->receive($this->newOrderPayload())->assertStatus(500);

        // Transaction rolled back: no half-registered customer or device (RNF-04)
        $this->assertDatabaseCount('customers', 0);
        $this->assertDatabaseCount('devices', 0);
    }

    public function test_order_is_kept_even_if_the_email_fails(): void
    {
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('SMTP caído'));

        $this->receive($this->newOrderPayload())
            ->assertCreated()
            ->assertJsonPath('email_sent', false);

        $this->assertDatabaseCount('service_orders', 1);
        $this->assertDatabaseHas('sent_emails', ['type' => 'order_registered', 'status' => 'failed']);
    }

    public function test_technician_cannot_receive_devices(): void
    {
        $this->receive($this->newOrderPayload(), User::factory()->technician()->create())
            ->assertStatus(403);
    }

    public function test_counter_lists_and_searches_orders(): void
    {
        $folio = $this->receive($this->newOrderPayload())->json('data.folio');
        $this->receive($this->newOrderPayload(['customer' => ['name' => 'Beto', 'phone' => '8710000000', 'email' => 'beto@correo.com']]));
        $this->app['auth']->forgetGuards();
        $token = $this->cashier->createToken('Caja', ['staff'])->plainTextToken;

        $this->withToken($token)->getJson('/api/v1/service-orders?active=1')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $this->withToken($token)->getJson('/api/v1/service-orders?search=8711234567')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.folio', $folio);

        $this->withToken($token)->getJson("/api/v1/service-orders/{$folio}")
            ->assertOk()
            ->assertJsonPath('data.customer.name', 'Ana')
            ->assertJsonMissingPath('data.device_pin');

        $this->withToken($token)->getJson('/api/v1/service-orders/OS-1999-99999')->assertStatus(404);
    }

    public function test_device_pin_is_visible_to_the_head_technician(): void
    {
        $folio = $this->receive($this->newOrderPayload())->json('data.folio');
        $head = User::factory()->headTechnician()->create();
        $this->app['auth']->forgetGuards();

        $this->withToken($head->createToken('PC', ['staff'])->plainTextToken)
            ->getJson("/api/v1/service-orders/{$folio}")
            ->assertOk()
            ->assertJsonPath('data.device_pin', '1234');
    }

    public function test_cashier_searches_and_registers_customers(): void
    {
        $token = $this->cashier->createToken('Caja', ['staff'])->plainTextToken;
        Customer::factory()->create(['name' => 'María', 'phone' => '8719998877']);

        $this->withToken($token)->getJson('/api/v1/customers?search=998877')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'María')
            ->assertJsonMissingPath('data.0.password');

        $this->withToken($token)->postJson('/api/v1/customers', [
            'name' => 'Pedro', 'phone' => '871-555-0000', 'email' => 'pedro@correo.com',
        ])->assertCreated()->assertJsonPath('data.phone', '8715550000');
    }

    public function test_cashier_generates_a_new_temporary_password_for_a_customer(): void
    {
        $customer = Customer::factory()->create();
        $customer->createToken('iPhone', ['customer']);

        $temporary = $this->withToken($this->cashier->createToken('Caja', ['staff'])->plainTextToken)
            ->postJson("/api/v1/customers/{$customer->id}/temporary-password")
            ->assertOk()
            ->json('temporary_password');

        $customer->refresh();
        $this->assertTrue($customer->must_change_password);
        $this->assertTrue(Hash::check($temporary, $customer->password));
        $this->assertSame(0, $customer->tokens()->count());
    }

    public function test_status_catalog_is_available(): void
    {
        $this->withToken($this->cashier->createToken('Caja', ['staff'])->plainTextToken)
            ->getJson('/api/v1/order-statuses')
            ->assertOk()
            ->assertJsonPath('data.0.code', 'received')
            ->assertJsonPath('data.0.color', '#2563EB');
    }
}
