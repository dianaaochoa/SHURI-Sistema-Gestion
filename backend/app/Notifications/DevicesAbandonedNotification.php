<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Aviso interno (RF-09): el proceso diario pasó equipos a "En Abandono".
 * Lo reciben quienes pueden mandarlos a bodega o a desecho (J9).
 */
class DevicesAbandonedNotification extends Notification
{
    use Queueable;

    /** @param  array<int, string>  $folios */
    public function __construct(private readonly array $folios) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        $count = count($this->folios);

        return [
            'kind' => 'devices_abandoned',
            'count' => $count,
            'folios' => $this->folios,
            'message' => $count === 1
                ? "El equipo {$this->folios[0]} pasó a En Abandono. Envíalo a bodega o a desecho."
                : "{$count} equipos pasaron a En Abandono. Envíalos a bodega o a desecho.",
        ];
    }
}
