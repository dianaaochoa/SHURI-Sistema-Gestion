<?php

namespace App\Services\Chat;

use App\Mail\OrderUpdateMail;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Message;
use App\Models\QuickReply;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Notifications\CustomerMessageNotification;
use App\Services\MailService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;

/**
 * Chat del portal entre el cliente y el jefe de técnicos (P5, J11 · RF-12).
 * Los mensajes no se editan ni se borran (triggers de la BD); al insertar uno,
 * el trigger trg_messages_inbox actualiza la conversación (último mensaje,
 * si espera respuesta, quién la atiende y la reabre si el cliente escribe).
 */
class ChatService
{
    public function __construct(private readonly MailService $mailer) {}

    /**
     * P5: el cliente escribe. Si ya tiene una conversación abierta del mismo
     * equipo (o general), el mensaje se agrega ahí en lugar de abrir otra.
     */
    public function startFromCustomer(Customer $customer, string $body, ?string $folio): Conversation
    {
        $orderId = null;

        if ($folio) {
            $orderId = ServiceOrder::where('folio', $folio)->where('customer_id', $customer->id)->value('id');

            if (! $orderId) {
                throw ValidationException::withMessages(['folio' => "No encontramos el folio {$folio} en tu cuenta."]);
            }
        }

        $conversation = Conversation::firstOrCreate(
            ['customer_id' => $customer->id, 'service_order_id' => $orderId, 'status' => 'open'],
        );

        $this->sendFromCustomer($conversation, $customer, $body);

        return $conversation->fresh();
    }

    public function sendFromCustomer(Conversation $conversation, Customer $customer, string $body): Message
    {
        if ($conversation->customer_id !== $customer->id) {
            throw ValidationException::withMessages(['conversation' => 'Esta conversación no es tuya.']);
        }

        $wasWaiting = (bool) $conversation->awaiting_reply;

        $message = Message::create([
            'conversation_id' => $conversation->id,
            'sender' => 'customer',
            'type' => 'text',
            'body' => trim($body),
        ]);

        // Aviso en la campanita solo cuando la conversación empieza a esperar respuesta
        if (! $wasWaiting) {
            Notification::send($this->repliers(), new CustomerMessageNotification($conversation->load('customer', 'serviceOrder'), $message));
        }

        return $message;
    }

    /** J11: el jefe responde; puede usar una respuesta rápida. El cliente recibe un aviso por correo. */
    public function reply(Conversation $conversation, User $staff, ?string $body, ?int $quickReplyId = null): Message
    {
        if ($quickReplyId) {
            $quick = QuickReply::where('is_active', true)->find($quickReplyId);

            if (! $quick) {
                throw ValidationException::withMessages(['quick_reply_id' => 'La respuesta rápida no existe.']);
            }

            $body = $body ?: $quick->body;
        }

        if (blank($body)) {
            throw ValidationException::withMessages(['body' => 'Escribe un mensaje.']);
        }

        $message = Message::create([
            'conversation_id' => $conversation->id,
            'sender' => 'staff',
            'user_id' => $staff->id,
            'type' => 'text',
            'body' => trim($body),
        ]);

        $this->notifyCustomer($conversation->load('customer', 'serviceOrder'), $staff, $message);

        return $message;
    }

    /**
     * Mensajes de la conversación, del más viejo al más nuevo. Al leerlos se marcan
     * como leídos los del otro lado (es lo único que los triggers permiten actualizar).
     *
     * @return Collection<int, Message>
     */
    public function read(Conversation $conversation, string $readerSide): Collection
    {
        $otherSide = $readerSide === 'customer' ? 'staff' : 'customer';

        Message::where('conversation_id', $conversation->id)
            ->where('sender', $otherSide)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return Message::with('user:id,name')
            ->where('conversation_id', $conversation->id)
            ->orderBy('id')
            ->get();
    }

    public function close(Conversation $conversation, User $staff): Conversation
    {
        $conversation->forceFill(['status' => 'closed', 'closed_at' => now(), 'awaiting_reply' => false])->save();

        return $conversation;
    }

    /**
     * "No disponible hoy" del jefe (RF-12): el portal se lo indica al cliente.
     *
     * @param  array{available: bool, unavailable_until?: string|null, message?: string|null}  $data
     */
    public function setAvailability(User $staff, array $data): User
    {
        $available = (bool) $data['available'];

        $staff->forceFill([
            'chat_available' => $available,
            'unavailable_until' => $available ? null : ($data['unavailable_until'] ?? now()->endOfDay()),
            'unavailable_message' => $available ? null : ($data['message'] ?? null),
        ])->save();

        return $staff;
    }

    /**
     * ¿Hay alguien que conteste el chat ahora? Si nadie está disponible,
     * devuelve el aviso que dejó el jefe para mostrarlo en el portal.
     *
     * @return array{available: bool, message: ?string, until: ?string}
     */
    public function availability(): array
    {
        $repliers = $this->repliers();

        $available = $repliers->first(fn (User $u) => $u->chat_available
            || ($u->unavailable_until && $u->unavailable_until->isPast()));

        if ($available || $repliers->isEmpty()) {
            return ['available' => true, 'message' => null, 'until' => null];
        }

        $away = $repliers->sortByDesc('unavailable_until')->first();

        return [
            'available' => false,
            'message' => $away->unavailable_message ?: 'El jefe de técnicos no está disponible hoy. Te responderemos en cuanto regrese.',
            'until' => $away->unavailable_until?->toIso8601String(),
        ];
    }

    /** Quienes contestan el chat (permiso chat.reply). */
    private function repliers(): Collection
    {
        return User::where('is_active', true)
            ->whereHas('role.permissions', fn ($q) => $q->where('code', 'chat.reply'))
            ->get();
    }

    private function notifyCustomer(Conversation $conversation, User $staff, Message $message): void
    {
        $folio = $conversation->serviceOrder?->folio;

        $this->mailer->send(new OrderUpdateMail(
            subjectLine: 'Te respondimos en el chat'.($folio ? " · Folio {$folio}" : ''),
            customerName: $conversation->customer->name,
            folio: $folio ?? 'Chat',
            title: 'Tienes una respuesta en el chat',
            body: strtok($staff->name, ' ').' respondió tu mensaje. Entra al portal para leerlo y continuar la conversación.',
            details: [],
            buttonText: 'Abrir el chat',
            portalUrl: config('app.portal_url'),
        ), $conversation->customer, 'chat_reply');
    }
}
