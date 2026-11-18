<?php

namespace App\Services\Invoicing\Contracts;

use App\Models\Invoice;

/**
 * Patrón Strategy: quién timbra las facturas. Hoy es una simulación (SimulatedStamper);
 * para facturar de verdad basta con otra implementación que hable con un PAC y
 * registrarla en AppServiceProvider, sin tocar InvoiceService.
 */
interface StamperInterface
{
    /**
     * Timbra el comprobante y devuelve el folio fiscal.
     *
     * @return array{uuid: string, stamped_at: \DateTimeInterface}
     */
    public function stamp(Invoice $invoice, string $xml): array;

    /** Solicita la cancelación ante el SAT con su motivo (01–04). */
    public function cancel(Invoice $invoice, string $reason, ?Invoice $replacement = null): void;

    /** true si los comprobantes no tienen validez fiscal. */
    public function isSimulated(): bool;
}
