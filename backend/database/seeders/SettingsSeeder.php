<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Business settings (AD9 / J9). Keys in English, descriptions in Spanish.
 * Secrets (SMTP password, CSD key password) belong in .env, not here.
 */
class SettingsSeeder extends Seeder
{
    public function run(): void
    {
        $s = [
            // [key, value, type, group, description]
            // Business and brand (AD9.1)
            ['business_name', 'Shuri', 'text', 'business', 'Nombre en tickets, correos y portal'],
            ['system_name', 'SHURI', 'text', 'business', 'Nombre del sistema'],
            ['legal_name', 'SHURI Reparaciones y Ventas S.A. de C.V.', 'text', 'business', 'Razón social'],
            ['address', 'Escribe aquí la dirección de la sucursal', 'text', 'business', 'Se muestra en el portal (R14)'],
            ['business_phone', '5500000000', 'text', 'business', 'Teléfono de contacto'],
            ['business_email', 'contacto@shuri.mx', 'text', 'business', 'Correo de contacto'],
            ['business_hours', 'Lun-Vie 10:00-19:00 / Sáb 10:00-14:00', 'text', 'business', 'Horario que se muestra en el portal (R14)'],
            ['logo_path', '', 'text', 'business', 'Logo del negocio (PNG/SVG ≥ 256 px)'],
            ['receipt_header', '¡Gracias por tu compra!', 'text', 'receipt', 'Encabezado del ticket'],
            ['receipt_footer', 'Cambios con ticket dentro de 7 días', 'text', 'receipt', 'Pie del ticket'],
            ['receipt_show_logo', '1', 'boolean', 'receipt', 'Mostrar logo en el ticket'],
            ['receipt_show_tax', '1', 'boolean', 'receipt', 'Imprimir desglose de IVA'],
            ['receipt_show_cashier', '1', 'boolean', 'receipt', 'Imprimir nombre de quien cobró'],
            // Cash registers and payments (AD9.2)
            ['tax_rate', '16', 'decimal', 'cash', 'Tasa de IVA en %'],
            ['prices_include_tax', '1', 'boolean', 'cash', 'Los precios al público ya incluyen IVA'],
            ['max_discount_cap_pct', '20', 'decimal', 'cash', 'Descuento máximo que se puede asignar a un usuario no administrador (RF-14)'],
            ['card_payments_enabled', '1', 'boolean', 'cash', 'Acepta tarjeta de débito/crédito'],
            ['card_fee_pct', '3.5', 'decimal', 'cash', 'Comisión de la terminal (se registra en el corte)'],
            ['transfer_payments_enabled', '1', 'boolean', 'cash', 'Acepta transferencia'],
            ['mixed_payments_enabled', '1', 'boolean', 'cash', 'Permite combinar formas de pago'],
            ['transfer_bank', 'BBVA', 'text', 'cash', 'Banco para transferencias'],
            ['transfer_clabe', '', 'text', 'cash', 'CLABE para transferencias'],
            ['transfer_holder', 'SHURI Reparaciones y Ventas S.A. de C.V.', 'text', 'cash', 'Titular de la cuenta'],
            // Workshop and storage (AD9.4 / J9)
            ['pickup_grace_days', '7', 'integer', 'workshop', 'Días sin costo para recoger el equipo después de "listo"'],
            ['storage_fee_amount', '10.00', 'decimal', 'workshop', 'Monto del cargo de almacenaje al vencer la gracia'],
            ['storage_fee_mode', 'per_day', 'text', 'workshop', 'per_day = monto por cada día extra; one_time = un solo cargo'],
            ['abandonment_days', '90', 'integer', 'workshop', 'Días sin recoger para marcar En Abandono (desecho electrónico)'],
            ['abandonment_notice_days', '7', 'integer', 'workshop', 'Días antes del abandono para enviar aviso'],
            ['allow_delivery_when_abandoned', '0', 'boolean', 'workshop', '1 = un equipo En Abandono aún se puede entregar; 0 = pasa a desecho'],
            ['quote_reminder_hours', '48', 'integer', 'workshop', 'Horas sin respuesta antes de recordar al cliente (R10)'],
            ['diagnosis_sla_hours', '24', 'integer', 'workshop', 'Horas para diagnóstico y cotización desde la recepción'],
            ['inspection_fee', '300.00', 'decimal', 'workshop', 'Costo de revisión; se descuenta si aprueba la reparación'],
            ['quote_valid_days', '7', 'integer', 'workshop', 'Días de vigencia de un presupuesto'],
            ['default_warranty_days', '30', 'integer', 'workshop', 'Días de garantía por defecto'],
            ['warranty_starts_from', 'delivery', 'text', 'workshop', 'Desde cuándo cuenta la garantía'],
            // Customer portal
            ['portal_temp_password_hours', '72', 'integer', 'portal', 'Horas de vigencia de la contraseña temporal'],
            ['portal_max_attempts', '5', 'integer', 'portal', 'Intentos fallidos antes de bloquear el acceso'],
            ['portal_lock_minutes', '15', 'integer', 'portal', 'Minutos de bloqueo tras exceder intentos'],
            // Staff access (A.1–A.6)
            ['staff_max_attempts', '5', 'integer', 'security', 'Intentos fallidos del personal antes de bloquear la cuenta'],
            ['staff_lock_minutes', '15', 'integer', 'security', 'Minutos de bloqueo de la cuenta del personal'],
            ['staff_mfa_enabled', '1', 'boolean', 'security', 'Pedir código por correo (MFA) al personal al iniciar sesión'],
            ['mfa_code_minutes', '10', 'integer', 'security', 'Minutos de vigencia del código de verificación'],
            ['mfa_max_attempts', '5', 'integer', 'security', 'Intentos permitidos para escribir el código'],
            ['password_reset_minutes', '15', 'integer', 'security', 'Minutos para responder la pregunta de seguridad al recuperar la contraseña'],
            // Email (AD9.7) — the SMTP password goes in .env (MAIL_PASSWORD)
            ['mail_from_address', 'avisos@shuri.mx', 'text', 'email', 'Correo remitente'],
            ['mail_from_name', 'SHURI Reparaciones y Ventas', 'text', 'email', 'Nombre del remitente'],
            ['mail_reply_to', 'No se reciben respuestas (usa el chat)', 'text', 'email', 'Responder a'],
            ['mail_host', 'smtp.shuri.mx', 'text', 'email', 'Servidor SMTP'],
            ['mail_port', '587', 'integer', 'email', 'Puerto SMTP'],
            ['mail_encryption', 'tls', 'text', 'email', 'Seguridad (tls/ssl)'],
            ['mail_username', 'avisos@shuri.mx', 'text', 'email', 'Usuario SMTP'],
            // Documents
            ['service_terms', '1. El cliente cuenta con 7 días naturales para recoger su equipo sin costo; después se cobrará almacenaje diario. 2. Los equipos no recogidos en 90 días se consideran abandonados y se envían a desecho electrónico sin derecho a devolución. 3. La garantía cubre únicamente la reparación realizada.', 'text', 'documents', 'Cláusulas impresas en la orden y mostradas en el portal'],
            ['privacy_notice', 'Shuri utiliza tus datos de contacto únicamente para dar seguimiento a tu servicio.', 'text', 'documents', 'Aviso de privacidad (P4.3)'],
            // Invoicing (AD9.5) — CSD files and their password stay outside the repo / in .env
            ['invoice_series', 'A', 'text', 'invoicing', 'Serie de facturas'],
            ['invoice_next_number', '1', 'integer', 'invoicing', 'Siguiente folio de la serie'],
            ['global_invoice_period', 'monthly', 'text', 'invoicing', 'Factura global mensual (último día)'],
            ['self_invoicing_enabled', '1', 'boolean', 'invoicing', 'Los clientes pueden autofacturar desde el portal (P4.2)'],
            ['issuer_rfc', 'XAXX010101000', 'text', 'invoicing', 'RFC del emisor'],
            ['issuer_name', 'SHURI', 'text', 'invoicing', 'Razón social del emisor'],
            ['issuer_tax_regime', '601', 'text', 'invoicing', 'Régimen fiscal del emisor'],
            ['issuer_postal_code', '06000', 'text', 'invoicing', 'C.P. de expedición'],
            ['csd_cer_path', '', 'text', 'invoicing', 'Ruta del certificado .cer'],
            ['csd_key_path', '', 'text', 'invoicing', 'Ruta de la llave privada .key'],
            ['csd_valid_until', '', 'text', 'invoicing', 'Vigencia del CSD (AAAA-MM-DD)'],
            ['stamps_purchased', '500', 'integer', 'invoicing', 'Timbres contratados'],
            ['stamps_alert_min', '50', 'integer', 'invoicing', 'Avisar cuando queden menos de N timbres'],
        ];

        $now = now();
        DB::table('settings')->insert(array_map(fn ($r) => [
            'key' => $r[0], 'value' => $r[1], 'type' => $r[2], 'group' => $r[3], 'description' => $r[4], 'updated_at' => $now,
        ], $s));
    }
}
