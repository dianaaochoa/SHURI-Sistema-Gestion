<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * RF-09: correcciones del resguardo.
 *
 * 1. v_storage_devices convertía la configuración a UNSIGNED, y restas como
 *    `abandonment_days - storage_days` se desbordaban al quedar negativas: la vista
 *    fallaba con cualquier equipo en días de gracia o con más de 90 días. Ahora es SIGNED.
 * 2. sp_process_storage ya no abre su propia transacción. Un START TRANSACTION dentro
 *    del procedimiento confirma en silencio la transacción que ya estaba abierta, así que
 *    ahora la controla Laravel (StorageService::process, con DB::transaction).
 *    Además guarda en la orden el almacenaje acumulado al pasar a "En Abandono",
 *    porque la vista ya no la calcula después.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE VIEW v_storage_devices AS
            WITH cfg AS (
              SELECT
                CAST(MAX(CASE WHEN `key` = 'pickup_grace_days'       THEN value END) AS SIGNED)        AS grace_days,
                CAST(MAX(CASE WHEN `key` = 'storage_fee_amount'      THEN value END) AS DECIMAL(10,2)) AS fee_amount,
                MAX(CASE WHEN `key` = 'storage_fee_mode' THEN value END)                               AS fee_mode,
                CAST(MAX(CASE WHEN `key` = 'abandonment_days'        THEN value END) AS SIGNED)        AS abandonment_days,
                CAST(MAX(CASE WHEN `key` = 'abandonment_notice_days' THEN value END) AS SIGNED)        AS notice_days
              FROM settings
            ), base AS (
              SELECT o.id AS service_order_id, o.folio, o.customer_id, c.name AS customer, c.phone, c.email,
                     s.code AS status_code, s.name AS status, o.location, o.ready_at, o.storage_fee_waived,
                     CAST(GREATEST(DATEDIFF(NOW(), o.ready_at), 0) AS SIGNED) AS storage_days,
                     cfg.grace_days, cfg.fee_amount, cfg.fee_mode, cfg.abandonment_days, cfg.notice_days
              FROM service_orders o
              JOIN order_statuses s ON s.id = o.status_id AND s.awaiting_pickup = 1
              JOIN customers c      ON c.id = o.customer_id
              CROSS JOIN cfg
              WHERE o.ready_at IS NOT NULL
            )
            SELECT service_order_id, folio, customer_id, customer, phone, email, status_code, status, location,
                   ready_at, storage_days,
                   DATE_ADD(DATE(ready_at), INTERVAL grace_days DAY)        AS free_until,
                   GREATEST(storage_days - grace_days, 0)                   AS chargeable_days,
                   CASE WHEN storage_fee_waived = 1 OR storage_days <= grace_days THEN 0.00
                        WHEN fee_mode = 'one_time' THEN fee_amount
                        ELSE (storage_days - grace_days) * fee_amount END   AS storage_fee,
                   storage_fee_waived,
                   DATE_ADD(DATE(ready_at), INTERVAL abandonment_days DAY)  AS abandonment_date,
                   abandonment_days - storage_days                          AS days_until_abandonment,
                   CASE WHEN storage_days >= abandonment_days               THEN 'abandon'
                        WHEN storage_days >= abandonment_days - notice_days THEN 'abandonment_notice'
                        WHEN storage_days >  grace_days                     THEN 'charging'
                        ELSE 'grace_period' END                             AS alert
            FROM base
            SQL);

        DB::unprepared('DROP PROCEDURE IF EXISTS sp_process_storage');
        DB::unprepared(<<<'SQL'
            CREATE PROCEDURE sp_process_storage(IN p_user_id BIGINT UNSIGNED)
            BEGIN
              DECLARE v_abandoned BIGINT UNSIGNED;
              DECLARE v_total INT DEFAULT 0;
              SELECT id INTO v_abandoned FROM order_statuses WHERE code = 'abandoned';

              DROP TEMPORARY TABLE IF EXISTS tmp_abandoned;
              CREATE TEMPORARY TABLE tmp_abandoned AS
                SELECT r.service_order_id, o.status_id AS previous_status_id, r.storage_days, r.storage_fee
                FROM v_storage_devices r
                JOIN service_orders o ON o.id = r.service_order_id
                WHERE r.alert = 'abandon' AND o.is_paid = 0;

              UPDATE service_orders o
                JOIN tmp_abandoned t ON t.service_order_id = o.id AND o.status_id = t.previous_status_id
                 SET o.status_id = v_abandoned, o.abandoned_at = NOW(), o.storage_fee = t.storage_fee,
                     o.updated_by = p_user_id, o.updated_at = NOW();

              INSERT INTO order_logs (service_order_id, user_id, type, previous_status_id, new_status_id, description, visible_to_customer)
              SELECT service_order_id, p_user_id, 'abandonment', previous_status_id, v_abandoned,
                     CONCAT('Equipo sin recoger por ', storage_days, ' días. Pasa a En Abandono (desecho electrónico).'), 1
              FROM tmp_abandoned;

              INSERT INTO audit_logs (user_id, module, action, table_name, record_id, description)
              SELECT p_user_id, 'workshop', 'auto_abandonment', 'service_orders', service_order_id,
                     CONCAT('Orden marcada En Abandono tras ', storage_days, ' días en resguardo')
              FROM tmp_abandoned;

              SELECT COUNT(*) INTO v_total FROM tmp_abandoned;
              DROP TEMPORARY TABLE tmp_abandoned;
              SELECT v_total AS abandoned_orders;
            END
            SQL);
    }

    public function down(): void
    {
        // La versión anterior se vuelve a crear corriendo de nuevo la migración de vistas y triggers
        DB::unprepared('DROP PROCEDURE IF EXISTS sp_process_storage');
    }
};
