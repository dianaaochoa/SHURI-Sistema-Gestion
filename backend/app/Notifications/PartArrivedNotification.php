<?php

namespace App\Notifications;

use App\Models\PartRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Aviso interno al técnico cuando llega del proveedor la pieza que pidió (T1, T5).
 */
class PartArrivedNotification extends Notification
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
        return [
            'kind' => 'part_arrived',
            'part_request_folio' => $this->request->folio,
            'service_order_folio' => $this->request->serviceOrder?->folio,
            'message' => "Llegó {$this->request->description} para la orden {$this->request->serviceOrder?->folio}. Pídela al jefe de técnicos.",
        ];
    }
}
