<?php

namespace App\Services\Invoicing;

use App\Models\Invoice;
use App\Services\Invoicing\Contracts\StamperInterface;
use Illuminate\Support\Str;

/**
 * Timbrado simulado (decisión del equipo): genera un folio fiscal (UUID) con el formato
 * del SAT, pero no se envía a ningún PAC y el comprobante no tiene validez fiscal.
 */
class SimulatedStamper implements StamperInterface
{
    public function stamp(Invoice $invoice, string $xml): array
    {
        return ['uuid' => mb_strtoupper((string) Str::uuid()), 'stamped_at' => now()];
    }

    public function cancel(Invoice $invoice, string $reason, ?Invoice $replacement = null): void
    {
        // Sin PAC: la cancelación solo queda registrada en la base de datos
    }

    public function isSimulated(): bool
    {
        return true;
    }
}
