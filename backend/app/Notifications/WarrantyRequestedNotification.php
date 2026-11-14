<?php

namespace App\Notifications;

use App\Models\Warranty;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Aviso interno a quien dictamina garantías cuando se pide una (J1, J4).
 */
class WarrantyRequestedNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly Warranty $warranty) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        $channel = $this->warranty->request_channel === 'portal' ? 'desde el portal' : 'en mostrador';

        return [
            'kind' => 'warranty_requested',
            'warranty_folio' => $this->warranty->folio,
            'service_order_folio' => $this->warranty->serviceOrder?->folio,
            'message' => "Nueva garantía {$this->warranty->folio} {$channel} para la orden {$this->warranty->serviceOrder?->folio}.",
        ];
    }
}
