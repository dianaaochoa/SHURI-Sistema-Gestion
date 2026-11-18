<?php

namespace Tests\Feature\Chat;

use App\Mail\OrderUpdateMail;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Message;
use App\Models\OrderStatus;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Notifications\CustomerMessageNotification;
use Database\Seeders\CatalogSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Chat del portal entre el cliente y el jefe de técnicos (P5, J11 · RF-12).
 */
class ChatTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    private User $head;

    private Customer $ana;

    private ServiceOrder $order;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();
        $this->head = User::factory()->headTechnician()->create(['name' => 'Jorge López']);
        $this->ana = Customer::factory()->create(['name' => 'Ana', 'email' => 'ana@correo.com']);

        $device = $this->ana->devices()->create(['type' => 'Celular', 'brand' => 'Apple', 'model' => 'iPhone 12']);
        $this->order = ServiceOrder::create([
            'folio' => 'OS-TEST-00001', 'customer_id' => $this->ana->id, 'device_id' => $device->id,
            'status_id' => OrderStatus::idFor(OrderStatus::IN_REPAIR), 'reported_issue' => 'No carga.',
            'received_by' => $this->head->id,
        ]);
    }

    private function as(User|Customer $account, string $method, string $uri, array $data = []): TestResponse
    {
        $this->app['auth']->forgetGuards();
        $ability = $account instanceof User ? 'staff' : 'customer';

        return $this->withToken($account->createToken('Celular', [$ability])->plainTextToken)->json($method, $uri, $data);
    }

    private function customerWrites(string $body = '¿Ya tienen la pieza de mi equipo?'): int
    {
        return $this->as($this->ana, 'POST', '/api/v1/portal/chat', ['body' => $body, 'folio' => $this->order->folio])
            ->assertCreated()
            ->json('conversation_id');
    }

    public function test_customer_writes_about_her_order_and_the_head_is_notified(): void
    {
        Notification::fake();

        $this->as($this->ana, 'POST', '/api/v1/portal/chat', ['body' => '¿Ya tienen la pieza?', 'folio' => $this->order->folio])
            ->assertCreated()
            ->assertJsonPath('data.0.body', '¿Ya tienen la pieza?')
            ->assertJsonPath('data.0.mine', true)
            ->assertJsonPath('availability.available', true);

        $conversation = Conversation::firstOrFail();
        $this->assertTrue($conversation->awaiting_reply);           // lo pone el trigger
        $this->assertNotNull($conversation->last_message_at);
        Notification::assertSentTo($this->head, CustomerMessageNotification::class);
    }

    public function test_further_messages_go_to_the_same_conversation_without_more_notifications(): void
    {
        Notification::fake();
        $first = $this->customerWrites();
        $second = $this->customerWrites('¿Para cuándo estaría?');

        $this->assertSame($first, $second);
        $this->assertSame(2, Message::count());
        Notification::assertSentTimes(CustomerMessageNotification::class, 1);
    }

    public function test_customer_cannot_write_about_someone_elses_order(): void
    {
        $other = Customer::factory()->create();

        $this->as($other, 'POST', '/api/v1/portal/chat', ['body' => 'Hola', 'folio' => $this->order->folio])
            ->assertStatus(422)
            ->assertJsonValidationErrors('folio');
    }

    public function test_head_sees_the_inbox_reads_and_replies(): void
    {
        $id = $this->customerWrites();
        $this->customerWrites('¿Para cuándo estaría?');

        $this->as($this->head, 'GET', '/api/v1/conversations?awaiting=1')
            ->assertOk()
            ->assertJsonPath('awaiting_reply', 1)
            ->assertJsonPath('data.0.unread', 2)
            ->assertJsonPath('data.0.service_order_folio', $this->order->folio)
            ->assertJsonPath('data.0.last_message', '¿Para cuándo estaría?');

        // Al abrir la conversación se marcan como leídos los mensajes del cliente
        $this->as($this->head, 'GET', "/api/v1/conversations/{$id}/messages")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.author', 'Cliente');
        $this->assertSame(0, Message::where('sender', 'customer')->whereNull('read_at')->count());

        $this->as($this->head, 'POST', "/api/v1/conversations/{$id}/messages", ['body' => 'La pieza llega mañana.'])
            ->assertCreated()
            ->assertJsonPath('data.mine', true)
            ->assertJsonPath('data.author', 'Jorge López');

        $conversation = Conversation::find($id);
        $this->assertFalse($conversation->awaiting_reply);          // lo quita el trigger
        $this->assertSame($this->head->id, $conversation->handled_by);
        Mail::assertSent(OrderUpdateMail::class, fn ($mail) => $mail->hasTo('ana@correo.com') && $mail->title === 'Tienes una respuesta en el chat');
    }

    public function test_head_can_reply_with_a_quick_reply(): void
    {
        $id = $this->customerWrites();
        $quick = $this->as($this->head, 'GET', '/api/v1/quick-replies')->assertOk()->json('data.0');

        $this->as($this->head, 'POST', "/api/v1/conversations/{$id}/messages", ['quick_reply_id' => $quick['id']])
            ->assertCreated()
            ->assertJsonPath('data.body', $quick['body']);
    }

    public function test_customer_reads_the_reply_with_only_the_first_name(): void
    {
        $id = $this->customerWrites();
        $this->as($this->head, 'POST', "/api/v1/conversations/{$id}/messages", ['body' => 'La pieza llega mañana.']);

        $this->as($this->ana, 'GET', '/api/v1/portal/chat')->assertJsonPath('data.0.unread', 1);

        $this->as($this->ana, 'GET', "/api/v1/portal/chat/{$id}/messages")
            ->assertOk()
            ->assertJsonPath('data.1.author', 'Jorge')
            ->assertJsonPath('data.1.mine', false);

        $this->as($this->ana, 'GET', '/api/v1/portal/chat')->assertJsonPath('data.0.unread', 0);
    }

    public function test_customer_cannot_open_another_customers_conversation(): void
    {
        $id = $this->customerWrites();

        $this->as(Customer::factory()->create(), 'GET', "/api/v1/portal/chat/{$id}/messages")->assertStatus(404);
        $this->as(Customer::factory()->create(), 'POST', "/api/v1/portal/chat/{$id}/messages", ['body' => 'Hola'])->assertStatus(404);
    }

    public function test_messages_cannot_be_edited_or_deleted(): void
    {
        $this->customerWrites();
        $message = Message::firstOrFail();

        $this->expectException(QueryException::class); // lo impide el trigger trg_messages_no_update
        $message->update(['body' => 'Mensaje cambiado']);
    }

    public function test_portal_shows_when_the_head_is_not_available_today(): void
    {
        $this->as($this->head, 'PUT', '/api/v1/chat/availability', [
            'available' => false,
            'unavailable_until' => now()->addHours(5)->toIso8601String(),
            'message' => 'Hoy estoy en capacitación; te respondo mañana temprano.',
        ])->assertOk()->assertJsonPath('data.chat_available', false);

        $this->as($this->ana, 'GET', '/api/v1/portal/chat')
            ->assertJsonPath('availability.available', false)
            ->assertJsonPath('availability.message', 'Hoy estoy en capacitación; te respondo mañana temprano.');

        // Al pasar la fecha vuelve a mostrarse disponible
        $this->travel(6)->hours();
        $this->as($this->ana, 'GET', '/api/v1/portal/chat')->assertJsonPath('availability.available', true);
    }

    public function test_closed_conversation_reopens_when_the_customer_writes_again(): void
    {
        $id = $this->customerWrites();
        $this->as($this->head, 'POST', "/api/v1/conversations/{$id}/close")->assertOk();
        $this->assertSame('closed', Conversation::find($id)->status);

        $this->as($this->ana, 'POST', "/api/v1/portal/chat/{$id}/messages", ['body' => 'Una pregunta más'])->assertCreated();

        $this->assertSame('open', Conversation::find($id)->status); // lo reabre el trigger
    }

    public function test_technician_has_no_access_to_the_inbox(): void
    {
        $this->as(User::factory()->technician()->create(), 'GET', '/api/v1/conversations')->assertStatus(403);
    }
}
