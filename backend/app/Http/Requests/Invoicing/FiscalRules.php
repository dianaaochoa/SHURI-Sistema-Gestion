<?php

namespace App\Http\Requests\Invoicing;

use App\Support\SatCatalog;
use Illuminate\Validation\Rule;

/**
 * Reglas de los datos fiscales del receptor, iguales en mostrador, administración y portal.
 * El formato del RFC y que el régimen corresponda al tipo de persona los revisa InvoiceService.
 */
final class FiscalRules
{
    /** @return array<string, array<int, mixed>> */
    public static function rules(bool $required = true): array
    {
        $need = $required ? 'required' : 'sometimes';

        return [
            'rfc' => [$need, 'string', 'min:12', 'max:13'],
            'business_name' => [$need, 'string', 'max:200'],
            'tax_regime' => [$need, Rule::in(array_keys(SatCatalog::TAX_REGIMES))],
            'postal_code' => [$need, 'digits:5'],
            'cfdi_use' => [$need, Rule::in(array_keys(SatCatalog::CFDI_USES))],
            'invoice_email' => ['nullable', 'email', 'max:150'],
        ];
    }

    /** @return array<string, string> */
    public static function attributes(): array
    {
        return [
            'rfc' => 'RFC',
            'business_name' => 'razón social',
            'tax_regime' => 'régimen fiscal',
            'postal_code' => 'código postal',
            'cfdi_use' => 'uso del CFDI',
            'invoice_email' => 'correo de facturación',
        ];
    }

    /** Catálogos para llenar los selects del formulario. */
    public static function catalogs(): array
    {
        return [
            'tax_regimes' => collect(SatCatalog::TAX_REGIMES)->map(fn ($r, $code) => [
                'code' => (string) $code, 'name' => $r[0], 'individual' => $r[1], 'company' => $r[2],
            ])->values(),
            'cfdi_uses' => collect(SatCatalog::CFDI_USES)->map(fn ($name, $code) => ['code' => $code, 'name' => $name])->values(),
            'cancellation_reasons' => collect(SatCatalog::CANCELLATION_REASONS)->map(fn ($name, $code) => ['code' => (string) $code, 'name' => $name])->values(),
        ];
    }
}
