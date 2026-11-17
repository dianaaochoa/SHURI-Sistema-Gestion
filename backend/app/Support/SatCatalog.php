<?php

namespace App\Support;

/**
 * Claves de los catálogos del SAT para CFDI 4.0 que usa el negocio (RF-16).
 * Es un subconjunto: solo las que aplican a un taller de reparación y venta de accesorios.
 */
final class SatCatalog
{
    /** RFC genérico para ventas al público en general (factura global). */
    public const GENERIC_RFC = 'XAXX010101000';

    /** Formato de RFC: 3 letras (moral) o 4 (física), fecha AAMMDD y homoclave. */
    public const RFC_PATTERN = '/^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/u';

    /** c_RegimenFiscal => [descripción, aplica a física, aplica a moral] */
    public const TAX_REGIMES = [
        '601' => ['General de Ley Personas Morales', false, true],
        '603' => ['Personas Morales con Fines no Lucrativos', false, true],
        '605' => ['Sueldos y Salarios e Ingresos Asimilados a Salarios', true, false],
        '606' => ['Arrendamiento', true, false],
        '612' => ['Personas Físicas con Actividades Empresariales y Profesionales', true, false],
        '616' => ['Sin obligaciones fiscales', true, false],
        '621' => ['Incorporación Fiscal', true, false],
        '625' => ['Actividades Empresariales con ingresos a través de Plataformas Tecnológicas', true, false],
        '626' => ['Régimen Simplificado de Confianza', true, true],
    ];

    /** c_UsoCFDI */
    public const CFDI_USES = [
        'G01' => 'Adquisición de mercancías',
        'G03' => 'Gastos en general',
        'I04' => 'Equipo de cómputo y accesorios',
        'S01' => 'Sin efectos fiscales',
    ];

    /** c_FormaPago por forma de pago del punto de venta */
    public const PAYMENT_FORMS = [
        'cash' => '01',
        'transfer' => '03',
        'card' => '04',
        'credit_note' => '17',
    ];

    /** @var array<string, string> c_FormaPago => descripción */
    public const PAYMENT_FORM_NAMES = [
        '01' => 'Efectivo',
        '03' => 'Transferencia electrónica de fondos',
        '04' => 'Tarjeta de crédito',
        '17' => 'Compensación',
    ];

    /** Motivos de cancelación del SAT */
    public const CANCELLATION_REASONS = [
        '01' => 'Comprobante emitido con errores con relación (se sustituye)',
        '02' => 'Comprobante emitido con errores sin relación',
        '03' => 'No se llevó a cabo la operación',
        '04' => 'Operación nominativa relacionada en una factura global',
    ];

    public static function isMoral(string $rfc): bool
    {
        return mb_strlen($rfc) === 12;
    }

    /** ¿El régimen fiscal corresponde al tipo de persona del RFC? */
    public static function regimeFits(string $rfc, string $regime): bool
    {
        $info = self::TAX_REGIMES[$regime] ?? null;

        return $info !== null && (self::isMoral($rfc) ? $info[2] : $info[1]);
    }
}
