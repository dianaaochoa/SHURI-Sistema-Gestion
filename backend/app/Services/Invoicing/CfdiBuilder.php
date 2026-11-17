<?php

namespace App\Services\Invoicing;

use App\Models\Invoice;
use App\Models\Sale;
use App\Services\SettingsService;
use App\Support\SatCatalog;
use DOMDocument;
use DOMElement;
use Illuminate\Support\Collection;

/**
 * Arma los conceptos y el XML con la estructura de un CFDI 4.0 (RF-16).
 * El XML lleva la leyenda de simulado y un timbre fiscal de prueba: no tiene validez fiscal.
 */
class CfdiBuilder
{
    private const NS_CFDI = 'http://www.sat.gob.mx/cfd/4';

    private const NS_TFD = 'http://www.sat.gob.mx/TimbreFiscalDigital';

    public function __construct(private readonly SettingsService $settings) {}

    /**
     * Conceptos de la factura con el IVA desglosado.
     * Individual: un concepto por renglón vendido. Global: un concepto por ticket (regla del SAT).
     *
     * @param  Collection<int, Sale>  $sales
     * @return array<int, array{product_key: string, unit_key: string, quantity: int, id: string, description: string, unit_value: float, amount: float, tax: float}>
     */
    public function concepts(Collection $sales, bool $global): array
    {
        $rate = $this->rate();

        if ($global) {
            return $sales->map(function (Sale $sale) {
                $base = round((float) $sale->subtotal - (float) $sale->discount, 2);

                return [
                    'product_key' => '01010101', 'unit_key' => 'ACT', 'quantity' => 1, 'id' => $sale->folio,
                    'description' => 'Venta', 'unit_value' => $base, 'amount' => $base, 'tax' => round((float) $sale->tax, 2),
                ];
            })->values()->all();
        }

        $includesTax = (bool) $this->settings->get('prices_include_tax', true);
        $concepts = [];

        foreach ($sales as $sale) {
            foreach ($sale->saleItems as $item) {
                if ((float) $item->subtotal <= 0) {
                    continue;
                }

                $amount = $includesTax ? round((float) $item->subtotal / (1 + $rate), 2) : round((float) $item->subtotal, 2);
                $quantity = max(1, (int) $item->quantity);
                $isProduct = $item->type === 'product';

                $concepts[] = [
                    // 01010101 = "No existe en el catálogo"; 81112300 = mantenimiento y soporte de hardware
                    'product_key' => $isProduct ? '01010101' : '81112300',
                    'unit_key' => $isProduct ? 'H87' : 'E48',
                    'quantity' => $quantity,
                    'id' => $sale->folio,
                    'description' => $item->description,
                    'unit_value' => round($amount / $quantity, 6),
                    'amount' => $amount,
                    'tax' => round($amount * $rate, 2),
                ];
            }
        }

        return $concepts;
    }

    /**
     * @param  array<int, array<string, mixed>>  $concepts
     * @return array{subtotal: float, tax: float, total: float}
     */
    public function totals(array $concepts): array
    {
        $subtotal = round(array_sum(array_column($concepts, 'amount')), 2);
        $tax = round(array_sum(array_column($concepts, 'tax')), 2);

        return ['subtotal' => $subtotal, 'tax' => $tax, 'total' => round($subtotal + $tax, 2)];
    }

    /** XML del comprobante ya timbrado. */
    public function xml(Invoice $invoice): string
    {
        $invoice->loadMissing('sales.saleItems');
        $global = $invoice->type === 'global';
        $concepts = $this->concepts($invoice->sales, $global);
        $rate = $this->rate();

        $doc = new DOMDocument('1.0', 'UTF-8');
        $doc->formatOutput = true;
        $doc->appendChild($doc->createComment(' CFDI SIMULADO · SIN VALIDEZ FISCAL · generado por SHURI para fines académicos '));

        $root = $this->el($doc, 'cfdi:Comprobante', [
            'Version' => '4.0',
            'Serie' => $invoice->series,
            'Folio' => (string) $invoice->number,
            'Fecha' => $invoice->issued_at?->format('Y-m-d\TH:i:s'),
            'FormaPago' => $invoice->payment_form,
            'MetodoPago' => $invoice->payment_method,
            'SubTotal' => $this->money($invoice->subtotal),
            'Moneda' => 'MXN',
            'Total' => $this->money($invoice->total),
            'TipoDeComprobante' => 'I',
            'Exportacion' => '01',
            'LugarExpedicion' => (string) $this->settings->get('issuer_postal_code', '00000'),
            'NoCertificado' => '00000000000000000000',
            'Sello' => 'SIMULADO',
            'Certificado' => 'SIMULADO',
        ], self::NS_CFDI);
        $root->setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:tfd', self::NS_TFD);
        $doc->appendChild($root);

        if ($global) {
            [$year, $month] = explode('-', (string) $invoice->period);
            $root->appendChild($this->el($doc, 'cfdi:InformacionGlobal', ['Periodicidad' => '04', 'Meses' => $month, 'Año' => $year]));
        }

        $root->appendChild($this->el($doc, 'cfdi:Emisor', [
            'Rfc' => (string) $this->settings->get('issuer_rfc'),
            'Nombre' => (string) $this->settings->get('issuer_name'),
            'RegimenFiscal' => (string) $this->settings->get('issuer_tax_regime'),
        ]));
        $root->appendChild($this->el($doc, 'cfdi:Receptor', [
            'Rfc' => $invoice->rfc,
            'Nombre' => $invoice->business_name,
            'DomicilioFiscalReceptor' => $invoice->postal_code,
            'RegimenFiscalReceptor' => $invoice->tax_regime,
            'UsoCFDI' => $invoice->cfdi_use,
        ]));

        $items = $this->el($doc, 'cfdi:Conceptos');
        foreach ($concepts as $c) {
            $concept = $this->el($doc, 'cfdi:Concepto', [
                'ClaveProdServ' => $c['product_key'],
                'NoIdentificacion' => $c['id'],
                'Cantidad' => (string) $c['quantity'],
                'ClaveUnidad' => $c['unit_key'],
                'Descripcion' => $c['description'],
                'ValorUnitario' => number_format($c['unit_value'], 6, '.', ''),
                'Importe' => $this->money($c['amount']),
                'ObjetoImp' => '02',
            ]);
            $taxes = $this->el($doc, 'cfdi:Impuestos');
            $transfers = $this->el($doc, 'cfdi:Traslados');
            $transfers->appendChild($this->transfer($doc, $c['amount'], $c['tax'], $rate));
            $taxes->appendChild($transfers);
            $concept->appendChild($taxes);
            $items->appendChild($concept);
        }
        $root->appendChild($items);

        $taxes = $this->el($doc, 'cfdi:Impuestos', ['TotalImpuestosTrasladados' => $this->money($invoice->tax)]);
        $transfers = $this->el($doc, 'cfdi:Traslados');
        $transfers->appendChild($this->transfer($doc, (float) $invoice->subtotal, (float) $invoice->tax, $rate));
        $taxes->appendChild($transfers);
        $root->appendChild($taxes);

        $complement = $this->el($doc, 'cfdi:Complemento');
        $complement->appendChild($this->el($doc, 'tfd:TimbreFiscalDigital', [
            'Version' => '1.1',
            'UUID' => (string) $invoice->sat_uuid,
            'FechaTimbrado' => $invoice->issued_at?->format('Y-m-d\TH:i:s'),
            'RfcProvCertif' => 'SIM010101AAA',
            'SelloCFD' => 'SIMULADO',
            'NoCertificadoSAT' => '00000000000000000000',
            'SelloSAT' => 'SIMULADO',
        ], self::NS_TFD));
        $root->appendChild($complement);

        return (string) $doc->saveXML();
    }

    private function transfer(DOMDocument $doc, float $base, float $tax, float $rate): DOMElement
    {
        return $this->el($doc, 'cfdi:Traslado', [
            'Base' => $this->money($base),
            'Impuesto' => '002',
            'TipoFactor' => 'Tasa',
            'TasaOCuota' => number_format($rate, 6, '.', ''),
            'Importe' => $this->money($tax),
        ]);
    }

    /** @param  array<string, string|null>  $attributes */
    private function el(DOMDocument $doc, string $name, array $attributes = [], string $ns = self::NS_CFDI): DOMElement
    {
        $element = $doc->createElementNS($ns, $name);

        foreach ($attributes as $key => $value) {
            if ($value !== null && $value !== '') {
                $element->setAttribute($key, $value);
            }
        }

        return $element;
    }

    private function money(mixed $value): string
    {
        return number_format((float) $value, 2, '.', '');
    }

    private function rate(): float
    {
        return (float) $this->settings->get('tax_rate', 16) / 100;
    }

    /** Nombre del archivo XML, p. ej. A-15_XAXX010101000.xml */
    public static function fileName(Invoice $invoice): string
    {
        return "{$invoice->series}-{$invoice->number}_{$invoice->rfc}.xml";
    }

    /** Descripción de la forma de pago para mostrarla. */
    public static function paymentFormName(string $code): string
    {
        return SatCatalog::PAYMENT_FORM_NAMES[$code] ?? $code;
    }
}
