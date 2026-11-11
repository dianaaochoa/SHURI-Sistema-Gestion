<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Catalog data the system needs to work: roles, permissions, order statuses,
 * labor levels, message templates, quick replies, settings and folio sequences.
 * Codes are in English; texts shown to people stay in Spanish.
 */
class CatalogSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();

        DB::table('roles')->insert([
            ['id' => 1, 'slug' => 'admin',           'name' => 'Administrador',    'description' => 'Usuarios, catálogo, auditoría y reportes', 'created_at' => $now, 'updated_at' => $now],
            ['id' => 2, 'slug' => 'head_technician', 'name' => 'Jefe de Técnicos', 'description' => 'Asigna, cotiza y supervisa reparaciones', 'created_at' => $now, 'updated_at' => $now],
            ['id' => 3, 'slug' => 'technician',      'name' => 'Técnico',          'description' => 'Diagnostica y repara equipos',            'created_at' => $now, 'updated_at' => $now],
            ['id' => 4, 'slug' => 'cashier',         'name' => 'Cajera',           'description' => 'Recepción, entrega y punto de venta',     'created_at' => $now, 'updated_at' => $now],
        ]);

        // AD7.3 Permissions by role
        $permissions = [
            ['pos.sell', 'Cobrar en punto de venta', 'cash'],
            ['pos.discount', 'Aplicar descuentos', 'cash'],
            ['pos.cancel_sale', 'Cancelar ventas', 'cash'],
            ['pos.refund', 'Devoluciones y notas de crédito', 'cash'],
            ['cash.shift', 'Abrir y cerrar turno de caja', 'cash'],
            ['cash.withdrawal', 'Retiros e ingresos de efectivo', 'cash'],
            ['cash.review_closing', 'Revisar cortes con diferencia', 'cash'],
            ['orders.receive', 'Recibir equipos (nueva orden)', 'workshop'],
            ['orders.deliver', 'Entregar equipos', 'workshop'],
            ['orders.assign', 'Asignar órdenes a técnicos', 'workshop'],
            ['orders.quote', 'Cotizar órdenes', 'workshop'],
            ['orders.repair', 'Diagnosticar y reparar', 'workshop'],
            ['orders.waive_storage', 'Perdonar cargo de almacenaje', 'workshop'],
            ['orders.storage', 'Enviar equipos a bodega / desecho', 'workshop'],
            ['warranties.rule', 'Dictaminar garantías', 'workshop'],
            ['chat.reply', 'Responder mensajes de clientes (J11)', 'workshop'],
            ['parts.request', 'Solicitar refacciones', 'inventory'],
            ['parts.handle', 'Atender solicitudes y pedidos', 'inventory'],
            ['inventory.view', 'Ver inventario', 'inventory'],
            ['inventory.stock_in', 'Registrar entradas de mercancía', 'inventory'],
            ['inventory.adjust', 'Ajustes de inventario', 'inventory'],
            ['catalog.prices', 'Editar precios del catálogo', 'catalog'],
            ['catalog.view_costs', 'Ver costos y utilidad', 'catalog'],
            ['purchasing.orders', 'Hacer pedidos a proveedor', 'purchasing'],
            ['suppliers.manage', 'Proveedores y cuentas por pagar', 'purchasing'],
            ['customers.manage', 'Alta y edición de clientes', 'customers'],
            ['reports.view', 'Ver reportes y estadísticas', 'reports'],
            ['users.manage', 'Usuarios y permisos', 'admin'],
            ['users.substitutions', 'Asignar suplencias de rol (ej. técnico cubre al jefe)', 'admin'],
            ['audit.view', 'Ver bitácora del personal', 'admin'],
            ['settings.edit', 'Editar configuración', 'admin'],
            ['invoicing.issue', 'Emitir facturas', 'invoicing'],
            ['invoicing.cancel', 'Cancelar facturas', 'invoicing'],
        ];
        DB::table('permissions')->insert(array_map(
            fn ($p) => ['code' => $p[0], 'name' => $p[1], 'module' => $p[2]],
            $permissions
        ));
        $ids = DB::table('permissions')->pluck('id', 'code');

        $grant = function (int $roleId, array $codes) use ($ids) {
            DB::table('permission_role')->insert(array_map(
                fn ($code) => ['role_id' => $roleId, 'permission_id' => $ids[$code]],
                $codes
            ));
        };
        // Admin: everything except working orders at the bench
        $grant(1, array_values(array_diff(array_keys($ids->all()), ['orders.repair', 'parts.request'])));
        $grant(2, ['orders.assign', 'orders.quote', 'orders.repair', 'orders.waive_storage', 'orders.storage',
            'warranties.rule', 'parts.handle', 'purchasing.orders', 'catalog.view_costs', 'inventory.view',
            'inventory.stock_in', 'inventory.adjust', 'chat.reply', 'reports.view']);
        $grant(3, ['orders.repair', 'parts.request', 'inventory.view']);
        $grant(4, ['pos.sell', 'pos.discount', 'pos.cancel_sale', 'pos.refund', 'cash.shift', 'cash.withdrawal',
            'orders.receive', 'orders.deliver', 'inventory.view', 'inventory.stock_in', 'inventory.adjust',
            'customers.manage', 'invoicing.issue']);
        // Limits and scopes from the AD7.3 matrix
        DB::table('permission_role')->where('role_id', 4)->where('permission_id', $ids['pos.discount'])->update(['limit_pct' => 10]);
        DB::table('permission_role')->where('role_id', 4)->whereIn('permission_id', [$ids['inventory.stock_in'], $ids['inventory.adjust']])->update(['scope' => 'against_order']);
        DB::table('permission_role')->where('role_id', 2)->where('permission_id', $ids['reports.view'])->update(['scope' => 'workshop_only']);

        // Order statuses (ids are fixed; the workflow trigger uses the codes)
        $statuses = [
            [1, 'received', 'Recibido en Sucursal', 'Tu equipo ha sido ingresado correctamente en nuestras instalaciones y está en cola para evaluación.', '#2563EB', 1, 1, 0, 1, 0],
            [2, 'assigned', 'Asignado a Técnico', 'Tu equipo ya fue asignado a uno de nuestros técnicos y pronto comenzará su revisión.', '#3B82F6', 2, 1, 0, 1, 0],
            [3, 'diagnosing', 'En Diagnóstico', 'Nuestros técnicos especializados están revisando tu dispositivo para determinar la causa de la falla y los repuestos requeridos.', '#EAB308', 3, 2, 0, 1, 0],
            [12, 'awaiting_customer', 'Esperando Información', 'Necesitamos un dato tuyo para continuar con la revisión (por ejemplo, el PIN de desbloqueo). Revisa el detalle o escríbenos por el chat.', '#D97706', 4, 2, 0, 0, 0],
            [11, 'quoting', 'En Cotización', 'Nuestro técnico terminó la revisión y estamos preparando tu presupuesto. En breve podrás consultarlo y aprobarlo aquí.', '#FB923C', 5, 2, 0, 0, 0],
            [4, 'quote_pending', 'Presupuesto Pendiente', "Hemos determinado el diagnóstico de tu equipo. Por favor, revisa el desglose del costo y presiona 'Aprobar' para iniciar la reparación.", '#F97316', 6, 3, 0, 0, 0],
            [5, 'in_repair', 'En Reparación', 'Presupuesto autorizado. Nuestro equipo técnico se encuentra trabajando en la reparación de tu dispositivo.', '#F59E0B', 7, 4, 0, 1, 0],
            [8, 'quote_rejected', 'Presupuesto Rechazado', 'Rechazaste el presupuesto. Tu equipo está disponible para recogerse en sucursal sin reparación.', '#DC2626', 8, 3, 0, 0, 1],
            [13, 'not_repairable', 'Sin Reparación', 'Después de la revisión, tu equipo no tiene reparación. Puedes pasar a recogerlo a la sucursal.', '#B91C1C', 9, 4, 0, 0, 1],
            [6, 'ready_for_pickup', 'Listo para Recoger', '¡Tu equipo está listo! Puedes acudir a nuestra sucursal dentro del horario de atención para realizar tu pago y recolección.', '#16A34A', 10, 5, 0, 0, 1],
            [7, 'delivered', 'Entregado y Pagado', 'El servicio ha sido completado y el equipo ha sido entregado al cliente.', '#15803D', 11, 6, 1, 0, 0],
            [9, 'abandoned', 'En Abandono', 'Tu equipo superó el tiempo máximo de resguardo y pasará a desecho electrónico conforme a las cláusulas aceptadas en la recepción.', '#6B7280', 12, 6, 0, 0, 0],
            [14, 'disposed', 'Desechado', 'Tu equipo fue enviado a desecho electrónico conforme a las cláusulas aceptadas en la recepción.', '#4B5563', 13, 6, 1, 0, 0],
            [10, 'cancelled', 'Cancelado', 'La orden de servicio fue cancelada.', '#9CA3AF', 14, 0, 1, 0, 0],
        ];
        DB::table('order_statuses')->insert(array_map(fn ($s) => [
            'id' => $s[0], 'code' => $s[1], 'name' => $s[2], 'customer_message' => $s[3], 'color_hex' => $s[4],
            'sort_order' => $s[5], 'portal_step' => $s[6], 'is_final' => $s[7], 'allows_work' => $s[8], 'awaiting_pickup' => $s[9],
        ], $statuses));

        // AD9.4 / J9.1 Labor levels
        DB::table('labor_levels')->insert([
            ['id' => 1, 'name' => 'Adicional', 'typical_time' => 'Hasta 30 min', 'examples' => 'Trabajo extra en re-cotización', 'price' => 150.00, 'is_inspection' => false, 'sort_order' => 1, 'created_at' => $now, 'updated_at' => $now],
            ['id' => 2, 'name' => 'Bajo', 'typical_time' => 'Hasta 1 h', 'examples' => 'Batería, pantalla con marco, limpieza', 'price' => 300.00, 'is_inspection' => false, 'sort_order' => 2, 'created_at' => $now, 'updated_at' => $now],
            ['id' => 3, 'name' => 'Medio', 'typical_time' => 'Hasta 1 h 30', 'examples' => 'Puerto de carga, conector de batería', 'price' => 580.00, 'is_inspection' => false, 'sort_order' => 3, 'created_at' => $now, 'updated_at' => $now],
            ['id' => 4, 'name' => 'Alto', 'typical_time' => 'Más de 1 h 30', 'examples' => 'Microsoldadura, humedad en placa', 'price' => 650.00, 'is_inspection' => false, 'sort_order' => 4, 'created_at' => $now, 'updated_at' => $now],
            ['id' => 5, 'name' => 'Revisión / diagnóstico', 'typical_time' => null, 'examples' => 'Se cobra si el cliente rechaza o no hay reparación', 'price' => 300.00, 'is_inspection' => true, 'sort_order' => 5, 'created_at' => $now, 'updated_at' => $now],
        ]);

        // AD9.6 Automatic messages (portal chat and/or email)
        $templates = [
            ['temporary_password', 'Contraseña temporal', 'Folio de cliente nuevo o si la pide', 1, 1, 'Tu acceso al portal · Folio {folio}',
                'Hola {cliente}, registramos tu {equipo} con el folio {folio}. Entra a {enlace} con tu correo y la contraseña temporal. Al entrar te pediremos crear una nueva.'],
            ['device_received', 'Equipo recibido', 'Al registrar la orden en caja', 1, 0, null,
                'Hola {cliente}, recibimos tu {equipo} con el folio {folio}. Te avisaremos cuando pase a diagnóstico.'],
            ['quote_ready', 'Presupuesto listo', 'Cuando el jefe envía el presupuesto', 1, 1, 'Tu cotización está lista · Folio {folio}',
                'Hola {cliente}, ya revisamos tu {equipo}. Revisa y autoriza tu presupuesto aquí: {enlace}'],
            ['info_request', 'Necesitamos un dato tuyo', 'Cuando el técnico pide información', 1, 1, 'Necesitamos un dato tuyo · Folio {folio}',
                'Hola {cliente}, necesitamos un dato para continuar con tu {equipo}. Respóndenos por el chat: {enlace}'],
            ['additional_charge', 'Cargo adicional', 'Cuando hay re-cotización', 1, 0, null,
                'Hola {cliente}, encontramos un daño adicional en tu {equipo}. Revisa el costo extra: {enlace}'],
            ['ready_for_pickup', 'Listo para recoger', 'Al marcar la orden como lista', 1, 1, 'Tu equipo está listo para recoger · Folio {folio}',
                'Hola {cliente}, tu {equipo} ya está listo en {negocio}. Folio {folio}. Total a pagar: {restante}. Sigue tu orden: {enlace}'],
            ['storage_reminder', 'Recordatorio de bodega', 'Días antes del cargo de almacenaje o del abandono', 1, 1, 'Tu equipo sigue esperándote · Folio {folio}',
                'Hola {cliente}, tu {equipo} sigue esperándote. Si no lo recoges a tiempo se cobrará almacenaje según las cláusulas.'],
            ['warranty_ruling', 'Dictamen de garantía', 'Cuando el jefe publica el dictamen', 1, 0, null,
                'Hola {cliente}, ya publicamos el dictamen de la garantía de tu {equipo}. Revísalo aquí: {enlace}'],
            ['chat_reply', 'Respuesta del taller', 'Cuando el jefe responde en el chat', 0, 1, 'Tienes una respuesta del taller · Folio {folio}',
                'El jefe de técnicos respondió tu mensaje. Entra a tu portal para verlo: {enlace}'],
        ];
        DB::table('message_templates')->insert(array_map(fn ($t) => [
            'code' => $t[0], 'name' => $t[1], 'sent_when' => $t[2], 'via_portal' => $t[3], 'via_email' => $t[4],
            'is_active' => true, 'email_subject' => $t[5], 'body' => $t[6], 'created_at' => $now, 'updated_at' => $now,
        ], $templates));

        // J11 Quick replies
        $replies = [
            ['Garantía en revisión', 'Ya tengo el reporte del técnico; hoy te confirmo si aplica la garantía.'],
            ['Qué traer', 'No, solo tu folio cuando pases por él. Si aplica la garantía, la reparación no tiene costo.'],
            ['Listo para recoger', 'Tu equipo ya está listo. Puedes pasar por él con tu folio e identificación.'],
            ['Cotización enviada', 'Te envié la cotización a tu portal; ahí puedes autorizarla o rechazarla.'],
            ['Necesitamos un accesorio', '¿Nos puedes traer tu cargador para hacer la prueba de carga?'],
        ];
        DB::table('quick_replies')->insert(array_map(fn ($r, $i) => [
            'title' => $r[0], 'body' => $r[1], 'sort_order' => $i + 1, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now,
        ], $replies, array_keys($replies)));

        DB::table('cash_registers')->insert([
            ['id' => 1, 'name' => 'Caja 01', 'location' => 'Mostrador principal', 'default_opening_amount' => 1000.00, 'shifts' => 'Matutino · Vespertino', 'terminal' => null, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
        ]);

        $this->call(SettingsSeeder::class);
        $this->call(CategorySeeder::class);

        $year = (int) $now->format('Y');
        DB::table('sequences')->insert(array_map(
            fn ($name) => ['name' => $name, 'year' => $year, 'value' => 0],
            ['service_order', 'sale', 'quote', 'part_request', 'purchase', 'purchase_order', 'warranty', 'sale_return', 'credit_note', 'cash_closing', 'cash_withdrawal']
        ));
    }
}
