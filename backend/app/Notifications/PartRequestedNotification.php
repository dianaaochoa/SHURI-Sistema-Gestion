<?php

namespace App\Notifications;

use App\Models\PartRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Aviso interno al jefe cuando un técnico pide una refacción (J1, J5).
 */
class PartRequestedNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly PartRequest $request) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        $urgent = $this->request->urgency === 'urgent' ? ' (urgente)' : '';

        return [
            'kind' => 'part_requested',
            'part_request_folio' => $this->request->folio,
            'service_order_folio' => $this->request->serviceOrder?->folio,
            'message' => "Piden {$this->request->quantity} × {$this->request->description} para la orden {$this->request->serviceOrder?->folio}{$urgent}.",
        ];
    }
}
