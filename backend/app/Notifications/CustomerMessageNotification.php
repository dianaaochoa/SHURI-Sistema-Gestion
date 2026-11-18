<?php

namespace App\Notifications;

use App\Models\Conversation;
use App\Models\Message;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Str;

/**
 * Aviso interno al jefe cuando un cliente escribe en el chat (J1, J11).
 */
class CustomerMessageNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly Conversation $conversation,
        private readonly Message $message,
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        $folio = $this->conversation->serviceOrder?->folio;

        return [
            'kind' => 'customer_message',
            'conversation_id' => $this->conversation->id,
            'service_order_folio' => $folio,
            'message' => "{$this->conversation->customer->name} escribió".($folio ? " sobre {$folio}" : '')
                .': «'.Str::limit($this->message->body, 60).'»',
        ];
    }
}
