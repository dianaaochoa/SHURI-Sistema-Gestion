<?php

namespace Tests\Feature\Cash;

use App\Models\CashShift;
use App\Models\User;
use App\Notifications\CashDifferenceNotification;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Turnos de caja (C1, C10, AD3 · RF-13, prioridad 3 del MVP).
 */
class CashShiftTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    private User $sofia;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        // La Caja 01 (id 1) se siembra con un fondo por defecto de $1,000
        $this->sofia = User::factory()->cashier()->create(['name' => 'Sofía', 'cash_register_id' => 1]);
        $this->admin = User::factory()->admin()->create();
    }

    private function as(User $user, string $method, string $uri, array $data = []): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($user->createToken('Caja', ['staff'])->plainTextToken)->json($method, $uri, $data);
    }

    private function openShift(?User $user = null, array $data = []): int
    {
        return $this->as($user ?? $this->sofia, 'POST', '/api/v1/cash-shifts', $data)->assertCreated()->json('data.id');
    }

    public function test_cashier_opens_a_shift_with_the_register_default_amount(): void
    {
        $this->as($this->sofia, 'POST', '/api/v1/cash-shifts')
            ->assertCreated()
            ->assertJsonPath('data.status', 'open')
            ->assertJsonPath('data.cash_register.name', 'Caja 01')
            ->assertJsonPath('data.opening_amount', 1000)
            ->assertJsonPath('summary.expected_cash', 1000);

        $this->as($this->sofia, 'GET', '/api/v1/cash-shifts/current')
            ->assertOk()
            ->assertJsonPath('data.cashier.name', 'Sofía');

        $this->assertDatabaseHas('audit_logs', ['action' => 'shift_opened', 'user_id' => $this->sofia->id]);
    }

    public function test_without_an_open_shift_current_is_null(): void
    {
        $this->as($this->sofia, 'GET', '/api/v1/cash-shifts/current')
            ->assertOk()
            ->assertJsonPath('data', null);
    }

    public function test_a_register_can_only_have_one_open_shift(): void
    {
        $this->openShift();
        $other = User::factory()->cashier()->create(['cash_register_id' => 1]);

        $this->as($other, 'POST', '/api/v1/cash-shifts')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['cash_register_id' => 'La Caja 01 ya tiene un turno abierto por Sofía.']);
    }

    public function test_cashier_cannot_open_two_shifts(): void
    {
        $this->openShift();

        $this->as($this->sofia, 'POST', '/api/v1/cash-shifts')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['cash_register_id' => 'Ya tienes un turno abierto. Ciérralo antes de abrir otro.']);
    }

    public function test_cash_withdrawal_cannot_exceed_the_cash_in_the_register(): void
    {
        $id = $this->openShift(data: ['opening_amount' => 500]);

        $this->as($this->sofia, 'POST', "/api/v1/cash-shifts/{$id}/movements", ['type' => 'cash_out', 'amount' => 600, 'reason' => 'Depósito'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['amount' => 'No puedes retirar $600.00: en caja hay $500.00.']);

        $this->as($this->sofia, 'POST', "/api/v1/cash-shifts/{$id}/movements", ['type' => 'cash_out', 'amount' => 200, 'reason' => 'Pago de garrafón'])
            ->assertCreated()
            ->assertJsonPath('summary.cash_out', 200)
            ->assertJsonPath('summary.expected_cash', 300)
            ->assertJsonPath('data.movements.0.cash_before', 500)
            ->assertJsonPath('data.movements.0.cash_after', 300);

        $this->assertMatchesRegularExpression('/^RET-\d{4}-\d{5}$/', CashShift::find($id)->cashMovements()->value('folio'));
    }

    public function test_cash_in_increases_the_expected_cash(): void
    {
        $id = $this->openShift(data: ['opening_amount' => 500]);

        $this->as($this->sofia, 'POST', "/api/v1/cash-shifts/{$id}/movements", ['type' => 'cash_in', 'amount' => 250.5, 'reason' => 'Cambio del banco'])
            ->assertCreated()
            ->assertJsonPath('summary.expected_cash', 750.5);
    }

    public function test_closing_with_the_exact_cash_is_balanced(): void
    {
        Notification::fake();
        $id = $this->openShift();
        $this->as($this->sofia, 'POST', "/api/v1/cash-shifts/{$id}/movements", ['type' => 'cash_out', 'amount' => 200, 'reason' => 'Depósito']);

        $response = $this->as($this->sofia, 'POST', "/api/v1/cash-shifts/{$id}/close", ['counted_cash' => 800, 'cash_left' => 500])
            ->assertOk()
            ->assertJsonPath('data.status', 'closed')
            ->assertJsonPath('data.expected_cash', 800)
            ->assertJsonPath('data.difference', 0)
            ->assertJsonPath('data.cash_handed_over', 300);

        $this->assertStringStartsWith('Corte CC-', $response->json('message'));
        Notification::assertNothingSent();
    }

    public function test_closing_with_a_difference_notifies_the_admin(): void
    {
        Notification::fake();
        $id = $this->openShift();

        $this->as($this->sofia, 'POST', "/api/v1/cash-shifts/{$id}/close", ['counted_cash' => 950])
            ->assertOk()
            ->assertJsonPath('data.difference', -50)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'faltante de $50.00'));

        Notification::assertSentTo($this->admin, CashDifferenceNotification::class);
        Notification::assertNotSentTo($this->sofia, CashDifferenceNotification::class);
    }

    public function test_after_closing_the_register_can_be_opened_again(): void
    {
        $id = $this->openShift();
        $this->as($this->sofia, 'POST', "/api/v1/cash-shifts/{$id}/close", ['counted_cash' => 1000])->assertOk();

        $this->openShift();
        $this->assertSame(2, CashShift::count());
    }

    public function test_closed_shift_cannot_take_more_movements(): void
    {
        $id = $this->openShift();
        $this->as($this->sofia, 'POST', "/api/v1/cash-shifts/{$id}/close", ['counted_cash' => 1000])->assertOk();

        $this->as($this->sofia, 'POST', "/api/v1/cash-shifts/{$id}/movements", ['type' => 'cash_in', 'amount' => 10, 'reason' => 'x'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('status');
    }

    public function test_another_cashier_cannot_close_my_shift_but_the_admin_can(): void
    {
        $id = $this->openShift();
        $other = User::factory()->cashier()->create();

        $this->as($other, 'POST', "/api/v1/cash-shifts/{$id}/close", ['counted_cash' => 1000])->assertStatus(403);
        $this->as($this->admin, 'POST', "/api/v1/cash-shifts/{$id}/close", ['counted_cash' => 1000])->assertOk();

        $this->assertSame($this->admin->id, CashShift::find($id)->closed_by);
    }

    public function test_admin_reviews_a_closed_shift(): void
    {
        $id = $this->openShift();

        $this->as($this->admin, 'POST', "/api/v1/cash-shifts/{$id}/review")
            ->assertStatus(422); // sigue abierto

        $this->as($this->sofia, 'POST', "/api/v1/cash-shifts/{$id}/close", ['counted_cash' => 990]);

        $this->as($this->sofia, 'POST', "/api/v1/cash-shifts/{$id}/review")->assertStatus(403);

        $this->as($this->admin, 'POST', "/api/v1/cash-shifts/{$id}/review", ['comment' => 'Faltante descontado de nómina'])
            ->assertOk()
            ->assertJsonPath('data.status', 'reviewed')
            ->assertJsonPath('data.review_comment', 'Faltante descontado de nómina');
    }

    public function test_cashier_sees_only_her_shifts_and_admin_sees_all(): void
    {
        $this->openShift();
        $other = User::factory()->cashier()->create();
        $otherShift = CashShift::create([
            'cash_register_id' => 1, 'user_id' => $other->id, 'opened_at' => now()->subDay(), 'closed_at' => now()->subDay(),
            'opening_amount' => 1000, 'expected_cash' => 1000, 'counted_cash' => 1000, 'status' => 'closed',
        ]);

        $this->as($this->sofia, 'GET', '/api/v1/cash-shifts')->assertJsonCount(1, 'data');
        $this->as($this->sofia, 'GET', "/api/v1/cash-shifts/{$otherShift->id}")->assertStatus(403);
        $this->as($this->admin, 'GET', '/api/v1/cash-shifts')->assertJsonCount(2, 'data');
    }

    public function test_technician_has_no_access_to_the_cash_register(): void
    {
        $this->as(User::factory()->technician()->create(), 'POST', '/api/v1/cash-shifts')->assertStatus(403);
    }
}
