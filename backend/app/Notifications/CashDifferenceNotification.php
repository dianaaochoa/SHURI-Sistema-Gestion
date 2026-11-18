<?php

namespace App\Notifications;

use App\Models\CashShift;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Aviso interno al administrador cuando un corte de caja tiene diferencia (RF-13, AD3).
 */
class CashDifferenceNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly CashShift $shift) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        $difference = (float) $this->shift->difference;
        $kind = $difference < 0 ? 'faltante' : 'sobrante';

        return [
            'kind' => 'cash_difference',
            'cash_shift_id' => $this->shift->id,
            'folio' => $this->shift->folio,
            'difference' => $difference,
            'message' => "Corte {$this->shift->folio} de {$this->shift->user->name} ({$this->shift->cashRegister->name}) con {$kind} de $"
                .number_format(abs($difference), 2).'.',
        ];
    }
}
