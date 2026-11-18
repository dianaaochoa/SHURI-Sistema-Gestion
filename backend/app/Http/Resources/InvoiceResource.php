<?php

namespace App\Http\Resources;

use App\Models\Invoice;
use App\Services\Invoicing\CfdiBuilder;
use App\Support\SatCatalog;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Factura (AD6, C3, P4.2). `is_simulated` indica que no tiene validez fiscal.
 *
 * @mixin Invoice
 */
class InvoiceResource extends JsonResource
{
    /** @var array<string, string> */
    private const STATUSES = ['pending' => 'Por timbrar', 'issued' => 'Vigente', 'cancelled' => 'Cancelada', 'error' => 'Con error'];

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'folio' => "{$this->series}-{$this->number}",
            'uuid' => $this->sat_uuid,
            'type' => $this->type,
            'period' => $this->period,
            'status' => $this->status,
            'status_name' => self::STATUSES[$this->status] ?? $this->status,
            'is_simulated' => true,
            'receiver' => [
                'rfc' => $this->rfc,
                'business_name' => $this->business_name,
                'tax_regime' => $this->tax_regime,
                'tax_regime_name' => SatCatalog::TAX_REGIMES[$this->tax_regime][0] ?? null,
                'postal_code' => $this->postal_code,
                'cfdi_use' => $this->cfdi_use,
                'cfdi_use_name' => SatCatalog::CFDI_USES[$this->cfdi_use] ?? null,
            ],
            'customer' => $this->whenLoaded('customer', fn () => $this->customer ? ['id' => $this->customer->id, 'name' => $this->customer->name] : null),
            'payment_form' => $this->payment_form,
            'payment_form_name' => CfdiBuilder::paymentFormName($this->payment_form),
            'payment_method' => $this->payment_method,
            'subtotal' => (float) $this->subtotal,
            'tax' => (float) $this->tax,
            'total' => (float) $this->total,
            'origin' => $this->origin,
            'sales' => $this->whenLoaded('sales', fn () => $this->sales->map(fn ($s) => ['folio' => $s->folio, 'total' => (float) $s->total])->all()),
            'issued_at' => $this->issued_at?->toIso8601String(),
            'cancelled_at' => $this->cancelled_at?->toIso8601String(),
            'cancellation_reason' => $this->cancellation_reason,
            'cancellation_reason_name' => $this->cancellation_reason ? (SatCatalog::CANCELLATION_REASONS[$this->cancellation_reason] ?? null) : null,
            'replaced_by' => $this->whenLoaded('replacedBy', fn () => $this->replacedBy ? "{$this->replacedBy->series}-{$this->replacedBy->number}" : null),
        ];
    }
}
