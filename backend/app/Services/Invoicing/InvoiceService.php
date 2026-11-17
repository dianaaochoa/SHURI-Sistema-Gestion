<?php

namespace App\Services\Invoicing;

use App\Mail\InvoiceMail;
use App\Models\Customer;
use App\Models\CustomerTaxProfile;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Sale;
use App\Models\User;
use App\Services\AuditService;
use App\Services\Invoicing\Contracts\StamperInterface;
use App\Services\MailService;
use App\Services\SettingsService;
use App\Support\SatCatalog;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Facturación (RF-16, AD6, C3, P4.2) con timbrado simulado:
 *  - Factura individual de una o varias ventas, con los datos fiscales del cliente.
 *  - Factura global del mes con las ventas que nadie facturó (público en general).
 *  - Cancelación con motivo del SAT y sustitución (motivo 01).
 */
class InvoiceService
{
    public function __construct(
        private readonly StamperInterface $stamper,
        private readonly CfdiBuilder $builder,
        private readonly SettingsService $settings,
        private readonly MailService $mailer,
        private readonly AuditService $audit,
    ) {}

    /**
     * Factura individual.
     *
     * @param  array<int, string>  $saleFolios
     * @param  array{rfc: string, business_name: string, tax_regime: string, postal_code: string, cfdi_use: string, invoice_email?: string|null}  $fiscal
     */
    public function issue(array $saleFolios, array $fiscal, ?User $by, string $origin = 'counter', ?Customer $owner = null): Invoice
    {
        $fiscal = $this->fiscal($fiscal);

        if ($fiscal['rfc'] === SatCatalog::GENERIC_RFC) {
            throw ValidationException::withMessages(['rfc' => 'Con el RFC genérico la venta entra en la factura global; para facturar a nombre del cliente usa su RFC.']);
        }

        return DB::transaction(function () use ($saleFolios, $fiscal, $by, $origin, $owner) {
            $sales = $this->invoiceableSales($saleFolios, $owner);
            $customerId = $owner?->id ?? $sales->pluck('customer_id')->filter()->unique()->first();

            return $this->create($sales, $fiscal + ['type' => 'individual', 'customer_id' => $customerId, 'origin' => $origin], $by);
        });
    }

    /** Factura global del mes: las ventas pagadas del periodo que no se facturaron (AAAA-MM). */
    public function issueGlobal(string $period, User $by): Invoice
    {
        $start = Carbon::createFromFormat('Y-m-d', "{$period}-01")->startOfDay();

        if ($start->isAfter(now()->startOfMonth())) {
            throw ValidationException::withMessages(['period' => 'No se puede facturar un mes que todavía no empieza.']);
        }

        return DB::transaction(function () use ($start, $period, $by) {
            $sales = Sale::with(['saleItems', 'payments'])
                ->where('status', 'paid')
                ->whereNull('invoice_id')
                ->whereBetween('paid_at', [$start, $start->copy()->endOfMonth()])
                ->lockForUpdate()
                ->get();

            if ($sales->isEmpty()) {
                throw ValidationException::withMessages(['period' => "No hay ventas sin facturar en {$period}."]);
            }

            return $this->create($sales, [
                'type' => 'global',
                'period' => $period,
                'customer_id' => null,
                'origin' => 'admin',
                'rfc' => SatCatalog::GENERIC_RFC,
                'business_name' => 'PUBLICO EN GENERAL',
                'tax_regime' => '616',
                'postal_code' => (string) $this->settings->get('issuer_postal_code', '00000'),
                'cfdi_use' => 'S01',
            ], $by);
        });
    }

    /** Cancelación sin sustituir (motivos 02, 03 o 04): las ventas quedan libres para facturarse otra vez. */
    public function cancel(Invoice $invoice, User $by, string $reason): Invoice
    {
        $this->expectIssued($invoice);

        DB::transaction(function () use ($invoice, $by, $reason) {
            $this->stamper->cancel($invoice, $reason);
            $this->markCancelled($invoice, $by, $reason);

            Sale::where('invoice_id', $invoice->id)->update(['invoice_id' => null, 'receipt_type' => 'ticket']);

            $this->audit->log('invoicing', 'invoice_cancelled', "Factura {$invoice->series}-{$invoice->number} cancelada (motivo {$reason})", $by->id, 'invoices', $invoice->id);
        });

        return $invoice->fresh(['sales', 'replacedBy']);
    }

    /**
     * Sustitución (motivo 01): se emite una factura nueva con los datos corregidos para las
     * mismas ventas y la anterior se cancela relacionada con la nueva.
     *
     * @param  array<string, mixed>  $fiscal
     */
    public function replace(Invoice $invoice, User $by, array $fiscal): Invoice
    {
        $this->expectIssued($invoice);

        if ($invoice->type === 'global') {
            throw ValidationException::withMessages(['type' => 'Una factura global no se sustituye con otros datos fiscales; cancélala y vuelve a emitirla.']);
        }

        $fiscal = $this->fiscal($fiscal + $invoice->only(['rfc', 'business_name', 'tax_regime', 'postal_code', 'cfdi_use']));

        return DB::transaction(function () use ($invoice, $by, $fiscal) {
            $sales = Sale::with(['saleItems', 'payments'])->where('invoice_id', $invoice->id)->lockForUpdate()->get();

            $new = $this->create($sales, $fiscal + ['type' => 'individual', 'customer_id' => $invoice->customer_id, 'origin' => 'admin'], $by);

            $this->stamper->cancel($invoice, '01', $new);
            $this->markCancelled($invoice, $by, '01', $new);

            $this->audit->log('invoicing', 'invoice_replaced', "Factura {$invoice->series}-{$invoice->number} sustituida por {$new->series}-{$new->number}", $by->id, 'invoices', $invoice->id);

            return $new;
        });
    }

    /**
     * Guarda los datos fiscales del cliente; el nuevo perfil queda como el predeterminado.
     *
     * @param  array<string, mixed>  $data
     */
    public function saveProfile(Customer $customer, array $data): CustomerTaxProfile
    {
        $fiscal = $this->fiscal($data);

        return DB::transaction(function () use ($customer, $fiscal) {
            $customer->customerTaxProfiles()->update(['is_default' => false]);

            return $customer->customerTaxProfiles()->updateOrCreate(
                ['rfc' => $fiscal['rfc']],
                $fiscal + ['is_default' => true],
            );
        });
    }

    public function xml(Invoice $invoice): string
    {
        return $this->builder->xml($invoice);
    }

    /** Timbres que quedan del paquete contratado (cada factura emitida usa uno). */
    public function stampsRemaining(): int
    {
        return max(0, $this->settings->int('stamps_purchased', 0) - Invoice::count());
    }

    public function isSimulated(): bool
    {
        return $this->stamper->isSimulated();
    }

    /**
     * @param  Collection<int, Sale>  $sales
     * @param  array<string, mixed>  $data
     */
    private function create(Collection $sales, array $data, ?User $by): Invoice
    {
        if ($this->stampsRemaining() <= 0) {
            throw ValidationException::withMessages(['stamps' => 'Se acabaron los timbres contratados. Compra más para seguir facturando.']);
        }

        // El correo de facturación no se guarda en la factura; solo se usa para enviarla
        $email = $data['invoice_email'] ?? null;
        unset($data['invoice_email']);

        $concepts = $this->builder->concepts($sales, $data['type'] === 'global');

        if (! $concepts) {
            throw ValidationException::withMessages(['sales' => 'Las ventas no tienen importes para facturar.']);
        }

        $invoice = Invoice::create($data + $this->builder->totals($concepts) + [
            'series' => (string) $this->settings->get('invoice_series', 'A'),
            'number' => $this->nextNumber(),
            'payment_form' => $this->paymentForm($sales),
            'payment_method' => 'PUE',
            'status' => 'pending',
            'issued_by' => $by?->id,
        ]);

        Sale::whereIn('id', $sales->pluck('id'))->update(['invoice_id' => $invoice->id, 'receipt_type' => 'invoice']);
        $invoice->setRelation('sales', $sales);

        $stamp = $this->stamper->stamp($invoice, $this->builder->xml($invoice));
        $invoice->forceFill(['sat_uuid' => $stamp['uuid'], 'issued_at' => $stamp['stamped_at'], 'status' => 'issued'])->save();

        $this->audit->log('invoicing', 'invoice_issued', "Factura {$invoice->series}-{$invoice->number} a {$invoice->rfc} por \${$invoice->total}", $by?->id, 'invoices', $invoice->id);

        $this->sendToCustomer($invoice, $email);

        return $invoice->fresh(['sales', 'customer']);
    }

    /**
     * @param  array<int, string>  $folios
     * @return Collection<int, Sale>
     */
    private function invoiceableSales(array $folios, ?Customer $owner): Collection
    {
        $sales = Sale::with(['saleItems', 'payments'])->whereIn('folio', $folios)->lockForUpdate()->get();

        foreach ($folios as $i => $folio) {
            $sale = $sales->firstWhere('folio', $folio);

            $error = match (true) {
                ! $sale, $owner && $sale->customer_id !== $owner->id => "No existe la venta {$folio}.",
                $sale->status !== 'paid' => "La venta {$folio} no está pagada o se canceló.",
                $sale->invoice_id !== null => "La venta {$folio} ya está facturada.",
                default => null,
            };

            if ($error) {
                throw ValidationException::withMessages(["sales.{$i}" => $error]);
            }
        }

        if ($sales->pluck('customer_id')->filter()->unique()->count() > 1) {
            throw ValidationException::withMessages(['sales' => 'Las ventas son de clientes distintos; factúralas por separado.']);
        }

        return $sales;
    }

    /**
     * Normaliza y valida los datos fiscales (RFC, régimen acorde al tipo de persona, uso y C.P.).
     *
     * @param  array<string, mixed>  $data
     * @return array{rfc: string, business_name: string, tax_regime: string, postal_code: string, cfdi_use: string, invoice_email: string|null}
     */
    private function fiscal(array $data): array
    {
        $rfc = mb_strtoupper(trim((string) ($data['rfc'] ?? '')));
        $regime = (string) ($data['tax_regime'] ?? '');

        if (! preg_match(SatCatalog::RFC_PATTERN, $rfc)) {
            throw ValidationException::withMessages(['rfc' => 'El RFC no tiene un formato válido (12 caracteres para persona moral, 13 para física).']);
        }
        if ($rfc !== SatCatalog::GENERIC_RFC && ! SatCatalog::regimeFits($rfc, $regime)) {
            throw ValidationException::withMessages(['tax_regime' => 'El régimen fiscal no corresponde a una persona '.(SatCatalog::isMoral($rfc) ? 'moral.' : 'física.')]);
        }

        return [
            'rfc' => $rfc,
            // El SAT pide la razón social en mayúsculas y sin el régimen societario (CFDI 4.0)
            'business_name' => mb_strtoupper(trim((string) $data['business_name'])),
            'tax_regime' => $regime,
            'postal_code' => (string) $data['postal_code'],
            'cfdi_use' => (string) $data['cfdi_use'],
            'invoice_email' => $data['invoice_email'] ?? null,
        ];
    }

    /** Folio consecutivo de la serie, con bloqueo para que dos cajas no tomen el mismo. */
    private function nextNumber(): int
    {
        $row = DB::table('settings')->where('key', 'invoice_next_number')->lockForUpdate()->first();
        $number = max((int) ($row->value ?? 1), (int) Invoice::where('series', $this->settings->get('invoice_series', 'A'))->max('number') + 1);

        DB::table('settings')->where('key', 'invoice_next_number')->update(['value' => (string) ($number + 1)]);

        return $number;
    }

    /**
     * Forma de pago del SAT: la que cubrió la mayor parte del importe.
     *
     * @param  Collection<int, Sale>  $sales
     */
    private function paymentForm(Collection $sales): string
    {
        $method = $sales->flatMap(fn (Sale $s) => $s->payments)
            ->groupBy('method')
            ->map(fn (Collection $p) => $p->sum(fn (Payment $x) => (float) $x->amount))
            ->sortDesc()
            ->keys()
            ->first();

        return SatCatalog::PAYMENT_FORMS[$method] ?? '01';
    }

    private function markCancelled(Invoice $invoice, User $by, string $reason, ?Invoice $replacement = null): void
    {
        $invoice->forceFill([
            'status' => 'cancelled',
            'cancelled_by' => $by->id,
            'cancelled_at' => now(),
            'cancellation_reason' => $reason,
            'replaced_by' => $replacement?->id,
        ])->save();
    }

    private function expectIssued(Invoice $invoice): void
    {
        if ($invoice->status !== 'issued') {
            throw ValidationException::withMessages(['status' => 'Solo se puede cancelar o sustituir una factura vigente.']);
        }
    }

    /** Manda la factura con su XML al correo de facturación del cliente, si lo tiene. */
    private function sendToCustomer(Invoice $invoice, ?string $email): void
    {
        $customer = $invoice->customer_id ? Customer::find($invoice->customer_id) : null;
        $address = $email ?: $customer?->email;

        if (! $customer || ! $address) {
            return;
        }

        $this->mailer->send(new InvoiceMail(
            subjectLine: "Tu factura {$invoice->series}-{$invoice->number}",
            customerName: $customer->name,
            folio: "{$invoice->series}-{$invoice->number}",
            body: 'Adjuntamos el XML de tu factura. Este comprobante es una simulación con fines académicos y no tiene validez fiscal.',
            details: [
                'RFC' => $invoice->rfc,
                'Total' => '$'.number_format((float) $invoice->total, 2),
                'Folio fiscal' => (string) $invoice->sat_uuid,
            ],
            portalUrl: config('app.portal_url'),
            xml: $this->builder->xml($invoice),
            fileName: CfdiBuilder::fileName($invoice),
        ), $customer, 'invoice', null, $address);
    }
}
