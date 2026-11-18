<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;


return new class extends Migration
{
    public function up(): void
    {
        foreach ($this->triggers() as $sql) {
            DB::unprepared($sql);
        }
        foreach ($this->views() as $sql) {
            DB::unprepared($sql);
        }
        DB::unprepared('DROP PROCEDURE IF EXISTS sp_process_storage');
        DB::unprepared($this->procedure());
    }

    public function down(): void
    {
        DB::unprepared('DROP PROCEDURE IF EXISTS sp_process_storage');
        foreach (array_reverse(array_keys($this->views())) as $view) {
            DB::unprepared("DROP VIEW IF EXISTS {$view}");
        }
        foreach (array_keys($this->triggers()) as $trigger) {
            DB::unprepared("DROP TRIGGER IF EXISTS {$trigger}");
        }
    }

    private function triggers(): array
    {
        return [
            'trg_audit_logs_no_update' => <<<'SQL'
                CREATE TRIGGER trg_audit_logs_no_update BEFORE UPDATE ON audit_logs FOR EACH ROW
                BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La auditoría es inmutable'; END
                SQL,
            'trg_audit_logs_no_delete' => <<<'SQL'
                CREATE TRIGGER trg_audit_logs_no_delete BEFORE DELETE ON audit_logs FOR EACH ROW
                BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La auditoría es inmutable'; END
                SQL,
            'trg_order_logs_no_update' => <<<'SQL'
                CREATE TRIGGER trg_order_logs_no_update BEFORE UPDATE ON order_logs FOR EACH ROW
                BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La bitácora de la orden es inmutable'; END
                SQL,
            'trg_order_logs_no_delete' => <<<'SQL'
                CREATE TRIGGER trg_order_logs_no_delete BEFORE DELETE ON order_logs FOR EACH ROW
                BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La bitácora de la orden es inmutable'; END
                SQL,
            'trg_messages_no_update' => <<<'SQL'
                CREATE TRIGGER trg_messages_no_update BEFORE UPDATE ON messages FOR EACH ROW
                BEGIN
                  IF NOT (NEW.conversation_id <=> OLD.conversation_id AND NEW.sender <=> OLD.sender
                          AND NEW.user_id <=> OLD.user_id AND NEW.type <=> OLD.type AND NEW.body <=> OLD.body
                          AND NEW.attachment_path <=> OLD.attachment_path AND NEW.created_at <=> OLD.created_at) THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Los mensajes no se pueden editar (solo marcar como leídos)';
                  END IF;
                END
                SQL,
            'trg_messages_no_delete' => <<<'SQL'
                CREATE TRIGGER trg_messages_no_delete BEFORE DELETE ON messages FOR EACH ROW
                BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Los mensajes no se pueden borrar'; END
                SQL,
            'trg_messages_inbox' => <<<'SQL'
                CREATE TRIGGER trg_messages_inbox AFTER INSERT ON messages FOR EACH ROW
                BEGIN
                  UPDATE conversations
                     SET last_message_at = NEW.created_at,
                         awaiting_reply = IF(NEW.sender = 'customer', 1, IF(NEW.sender = 'staff', 0, awaiting_reply)),
                         status = IF(NEW.sender = 'customer', 'open', status),
                         handled_by = IF(NEW.sender = 'staff' AND handled_by IS NULL, NEW.user_id, handled_by),
                         updated_at = NOW()
                   WHERE id = NEW.conversation_id;
                END
                SQL,

            'trg_role_substitutions_insert' => <<<'SQL'
                CREATE TRIGGER trg_role_substitutions_insert BEFORE INSERT ON role_substitutions FOR EACH ROW
                BEGIN
                  DECLARE v_base_role BIGINT UNSIGNED; DECLARE v_active TINYINT; DECLARE v_slug VARCHAR(30);
                  SELECT role_id, is_active INTO v_base_role, v_active FROM users WHERE id = NEW.user_id;
                  SELECT slug INTO v_slug FROM roles WHERE id = NEW.role_id;
                  IF v_active = 0 THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No se puede asignar una suplencia a un usuario inactivo';
                  END IF;
                  IF NEW.role_id = v_base_role THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El usuario ya tiene ese rol como rol base';
                  END IF;
                  IF v_slug = 'admin' THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El rol de Administrador no se presta por suplencia';
                  END IF;
                  IF NEW.substitutes_user_id = NEW.user_id THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Un usuario no puede suplirse a sí mismo';
                  END IF;
                END
                SQL,
            'trg_role_substitutions_update' => <<<'SQL'
                CREATE TRIGGER trg_role_substitutions_update BEFORE UPDATE ON role_substitutions FOR EACH ROW
                BEGIN
                  IF NEW.user_id <> OLD.user_id OR NEW.role_id <> OLD.role_id THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Para cambiar usuario o rol crea una suplencia nueva';
                  END IF;
                END
                SQL,
            'trg_service_orders_workflow' => <<<'SQL'
                CREATE TRIGGER trg_service_orders_workflow BEFORE UPDATE ON service_orders FOR EACH ROW
                BEGIN
                  DECLARE v_old_final TINYINT; DECLARE v_new_pickup TINYINT; DECLARE v_old_pickup TINYINT;
                  DECLARE v_new_code VARCHAR(40); DECLARE v_old_code VARCHAR(40);
                  DECLARE v_allow_delivery VARCHAR(10);
                  SELECT is_final, awaiting_pickup, code INTO v_old_final, v_old_pickup, v_old_code FROM order_statuses WHERE id = OLD.status_id;
                  SELECT awaiting_pickup, code INTO v_new_pickup, v_new_code FROM order_statuses WHERE id = NEW.status_id;

                  IF v_old_final = 1 AND NEW.status_id <> OLD.status_id THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La orden está en un estado final y no puede cambiar de estado';
                  END IF;

                  IF v_old_code = 'abandoned' AND NEW.status_id <> OLD.status_id THEN
                    SELECT value INTO v_allow_delivery FROM settings WHERE `key` = 'allow_delivery_when_abandoned';
                    IF NOT (v_new_code = 'disposed' OR (v_new_code = 'delivered' AND v_allow_delivery = '1')) THEN
                      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Un equipo en abandono solo puede pasar a desecho electrónico';
                    END IF;
                  END IF;

                  IF NEW.status_id <> OLD.status_id THEN
                    IF v_new_pickup = 1 AND v_old_pickup = 0 AND NEW.ready_at IS NULL THEN
                      SET NEW.ready_at = NOW();
                    END IF;
                    IF v_new_code = 'quoting'    AND NEW.quoting_started_at IS NULL THEN SET NEW.quoting_started_at = NOW(); END IF;
                    IF v_new_code = 'in_repair'  AND NEW.approved_at IS NULL        THEN SET NEW.approved_at = NOW(); END IF;
                    IF v_new_code = 'assigned'   AND NEW.assigned_at IS NULL        THEN SET NEW.assigned_at = NOW(); END IF;
                    IF v_new_code = 'abandoned'  AND NEW.abandoned_at IS NULL       THEN SET NEW.abandoned_at = NOW(); END IF;
                    IF v_new_code = 'disposed'   AND NEW.disposed_at IS NULL        THEN SET NEW.disposed_at = NOW(); END IF;
                    IF v_new_code = 'delivered' THEN
                      IF NEW.delivered_at IS NULL THEN SET NEW.delivered_at = NOW(); END IF;
                      SET NEW.location = 'counter';
                      IF NEW.warranty_until IS NULL AND v_old_code NOT IN ('not_repairable', 'quote_rejected')
                         AND NEW.labor_cost + NEW.parts_cost > 0 THEN
                        SET NEW.warranty_until = DATE_ADD(DATE(NEW.delivered_at), INTERVAL NEW.warranty_days DAY);
                      END IF;
                    END IF;
                  END IF;
                END
                SQL,
        ];
    }

    private function views(): array
    {
        return [
            'v_storage_devices' => <<<'SQL'
                CREATE OR REPLACE VIEW v_storage_devices AS
                WITH cfg AS (
                  SELECT
                    CAST(MAX(CASE WHEN `key` = 'pickup_grace_days'       THEN value END) AS UNSIGNED)      AS grace_days,
                    CAST(MAX(CASE WHEN `key` = 'storage_fee_amount'      THEN value END) AS DECIMAL(10,2)) AS fee_amount,
                    MAX(CASE WHEN `key` = 'storage_fee_mode' THEN value END)                               AS fee_mode,
                    CAST(MAX(CASE WHEN `key` = 'abandonment_days'        THEN value END) AS UNSIGNED)      AS abandonment_days,
                    CAST(MAX(CASE WHEN `key` = 'abandonment_notice_days' THEN value END) AS UNSIGNED)      AS notice_days
                  FROM settings
                ), base AS (
                  SELECT o.id AS service_order_id, o.folio, o.customer_id, c.name AS customer, c.phone, c.email,
                         s.code AS status_code, s.name AS status, o.location, o.ready_at, o.storage_fee_waived,
                         GREATEST(DATEDIFF(NOW(), o.ready_at), 0) AS storage_days,
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
                SQL,
            'v_portal_orders' => <<<'SQL'
                CREATE OR REPLACE VIEW v_portal_orders AS
                SELECT o.id AS service_order_id, o.folio, c.id AS customer_id, c.phone, c.email,
                       c.name AS customer_name,
                       d.type AS device_type, d.brand AS device_brand, d.model AS device_model,
                       s.code AS status_code, s.name AS status, s.customer_message, s.color_hex,
                       s.portal_step, s.is_final,
                       o.reported_issue, o.diagnosis, u.name AS technician,
                       o.labor_cost, o.parts_cost, o.total, o.deposit,
                       IF(o.is_paid = 1, 0.00, GREATEST(o.total - o.deposit, 0)) AS balance,
                       COALESCE(r.storage_fee, o.storage_fee) AS storage_fee,
                       IF(o.is_paid = 1, 0.00, GREATEST(o.total - o.deposit, 0) + COALESCE(r.storage_fee, 0)) AS amount_due,
                       r.free_until, r.abandonment_date, r.days_until_abandonment,
                       o.is_paid, o.promised_date, o.created_at AS received_at, o.ready_at, o.delivered_at,
                       o.warranty_until, (o.warranty_until IS NOT NULL AND o.warranty_until >= CURDATE()) AS warranty_active,
                       o.rating,
                       (SELECT q.id FROM quotes q WHERE q.service_order_id = o.id AND q.status = 'pending'
                         ORDER BY q.id DESC LIMIT 1) AS pending_quote_id,
                       (SELECT w.id FROM warranties w WHERE w.service_order_id = o.id
                         AND w.status NOT IN ('delivered', 'cancelled', 'rejected') ORDER BY w.id DESC LIMIT 1) AS active_warranty_id
                FROM service_orders o
                JOIN customers c       ON c.id = o.customer_id
                JOIN devices d         ON d.id = o.device_id
                JOIN order_statuses s  ON s.id = o.status_id
                LEFT JOIN users u      ON u.id = o.technician_id
                LEFT JOIN v_storage_devices r ON r.service_order_id = o.id
                SQL,
            'v_portal_timeline' => <<<'SQL'
                CREATE OR REPLACE VIEW v_portal_timeline AS
                SELECT l.service_order_id, o.folio, c.email, l.created_at, l.type, l.description,
                       s.name AS status, s.color_hex
                FROM order_logs l
                JOIN service_orders o ON o.id = l.service_order_id
                JOIN customers c      ON c.id = o.customer_id
                LEFT JOIN order_statuses s ON s.id = l.new_status_id
                WHERE l.visible_to_customer = 1
                SQL,
            'v_effective_roles' => <<<'SQL'
                CREATE OR REPLACE VIEW v_effective_roles AS
                SELECT u.id AS user_id, u.name, r.id AS role_id, r.slug, r.name AS role,
                       'base' AS origin, NULL AS substitution_id, NULL AS substitutes_user_id, NULL AS valid_until
                FROM users u
                JOIN roles r ON r.id = u.role_id
                WHERE u.is_active = 1
                UNION ALL
                SELECT u.id, u.name, r.id, r.slug, r.name,
                       'substitution', rs.id, rs.substitutes_user_id, rs.ends_at
                FROM role_substitutions rs
                JOIN users u ON u.id = rs.user_id AND u.is_active = 1
                JOIN roles r ON r.id = rs.role_id
                WHERE rs.revoked_at IS NULL AND rs.starts_at <= NOW() AND (rs.ends_at IS NULL OR rs.ends_at > NOW())
                SQL,
            'v_effective_permissions' => <<<'SQL'
                CREATE OR REPLACE VIEW v_effective_permissions AS
                SELECT DISTINCT er.user_id, p.code AS permission, p.module
                FROM v_effective_roles er
                JOIN permission_role pr ON pr.role_id = er.role_id
                JOIN permissions p      ON p.id = pr.permission_id
                SQL,
            'v_technician_workload' => <<<'SQL'
                CREATE OR REPLACE VIEW v_technician_workload AS
                SELECT u.id AS technician_id, u.name AS technician, u.specialty,
                       COUNT(o.id) AS active_orders,
                       COALESCE(SUM(o.priority IN ('high', 'urgent')), 0) AS priority_orders,
                       COALESCE(SUM(s.code = 'diagnosing'), 0) AS diagnosing,
                       COALESCE(SUM(o.is_paused = 1), 0) AS paused
                FROM users u
                JOIN roles r ON r.id = u.role_id AND r.slug = 'technician'
                LEFT JOIN service_orders o ON o.technician_id = u.id
                LEFT JOIN order_statuses s ON s.id = o.status_id
                WHERE u.is_active = 1 AND (o.id IS NULL OR (s.is_final = 0 AND s.awaiting_pickup = 0))
                GROUP BY u.id, u.name, u.specialty
                SQL,
            'v_orders_to_quote' => <<<'SQL'
                CREATE OR REPLACE VIEW v_orders_to_quote AS
                SELECT q.id AS quote_id, q.folio AS quote_folio, q.type, q.is_urgent,
                       o.id AS service_order_id, o.folio, c.name AS customer,
                       CONCAT(d.brand, ' ', COALESCE(d.model, '')) AS device,
                       u.name AS technician, q.diagnosis, l.name AS labor_level, q.estimated_minutes,
                       q.labor_amount, q.parts_amount, q.total, o.priority,
                       q.created_at AS sent_by_technician_at,
                       TIMESTAMPDIFF(MINUTE, q.created_at, NOW()) AS minutes_waiting,
                       (o.diagnosis_due_at IS NOT NULL AND o.diagnosis_due_at < NOW()) AS is_late
                FROM quotes q
                JOIN service_orders o ON o.id = q.service_order_id
                JOIN customers c      ON c.id = o.customer_id
                JOIN devices d        ON d.id = o.device_id
                LEFT JOIN users u     ON u.id = q.technician_id
                LEFT JOIN labor_levels l ON l.id = q.labor_level_id
                WHERE q.status = 'to_quote'
                SQL,
            'v_available_stock' => <<<'SQL'
                CREATE OR REPLACE VIEW v_available_stock AS
                SELECT p.id AS product_id, p.sku, p.name, p.stock,
                       COALESCE(SUM(CASE WHEN op.status = 'reserved' THEN op.quantity END), 0) AS reserved,
                       p.stock - COALESCE(SUM(CASE WHEN op.status = 'reserved' THEN op.quantity END), 0) AS available,
                       p.min_stock
                FROM products p
                LEFT JOIN order_parts op ON op.product_id = p.id
                WHERE p.is_active = 1
                GROUP BY p.id, p.sku, p.name, p.stock, p.min_stock
                SQL,
            'v_message_inbox' => <<<'SQL'
                CREATE OR REPLACE VIEW v_message_inbox AS
                SELECT cv.id AS conversation_id, cv.status, cv.awaiting_reply, cv.last_message_at,
                       c.id AS customer_id, CONCAT(c.name, ' ', COALESCE(c.last_name, '')) AS customer,
                       o.folio, CONCAT(d.brand, ' ', COALESCE(d.model, '')) AS device,
                       (SELECT m.body FROM messages m WHERE m.conversation_id = cv.id ORDER BY m.id DESC LIMIT 1) AS last_message,
                       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = cv.id
                          AND m.sender = 'customer' AND m.read_at IS NULL) AS unread,
                       u.name AS handled_by
                FROM conversations cv
                JOIN customers c ON c.id = cv.customer_id
                LEFT JOIN service_orders o ON o.id = cv.service_order_id
                LEFT JOIN devices d ON d.id = o.device_id
                LEFT JOIN users u ON u.id = cv.handled_by
                SQL,
            'v_technician_performance' => <<<'SQL'
                CREATE OR REPLACE VIEW v_technician_performance AS
                SELECT u.id AS technician_id, u.name AS technician,
                       COUNT(o.id) AS delivered_orders,
                       IFNULL(SUM(o.total), 0) AS revenue,
                       ROUND(AVG(TIMESTAMPDIFF(HOUR, o.assigned_at, o.ready_at)), 1) AS avg_repair_hours,
                       ROUND(AVG(o.rating), 2) AS avg_rating
                FROM users u
                JOIN roles r ON r.id = u.role_id AND r.slug = 'technician'
                LEFT JOIN service_orders o ON o.technician_id = u.id
                  AND o.status_id = (SELECT id FROM order_statuses WHERE code = 'delivered')
                GROUP BY u.id, u.name
                SQL,
            'v_daily_revenue' => <<<'SQL'
                CREATE OR REPLACE VIEW v_daily_revenue AS
                SELECT CAST(s.paid_at AS DATE) AS date, COUNT(*) AS sales, SUM(s.total) AS total
                FROM sales s
                WHERE s.status IN ('paid', 'partially_returned')
                GROUP BY CAST(s.paid_at AS DATE)
                SQL,
            'v_low_stock' => <<<'SQL'
                CREATE OR REPLACE VIEW v_low_stock AS
                SELECT p.id, p.sku, p.name, c.name AS category, p.type, p.stock, p.min_stock
                FROM products p
                JOIN categories c ON c.id = p.category_id
                WHERE p.is_active = 1 AND p.stock <= p.min_stock
                SQL,
            'v_shift_cash_summary' => <<<'SQL'
                CREATE OR REPLACE VIEW v_shift_cash_summary AS
                SELECT t.id AS cash_shift_id, t.cash_register_id, t.user_id, t.status, t.opened_at, t.opening_amount,
                       COALESCE(pg.cash, 0)          AS cash_sales,
                       COALESCE(pg.card, 0)          AS card_sales,
                       COALESCE(pg.transfer, 0)      AS transfer_sales,
                       COALESCE(cm.cash_in, 0)       AS cash_in,
                       COALESCE(cm.cash_out, 0)      AS cash_out,
                       COALESCE(sr.refunds, 0)       AS cash_refunds,
                       COALESCE(sp.supplier_paid, 0) AS cash_supplier_payments,
                       t.opening_amount + COALESCE(pg.cash, 0) + COALESCE(cm.cash_in, 0) - COALESCE(cm.cash_out, 0)
                         - COALESCE(sr.refunds, 0) - COALESCE(sp.supplier_paid, 0) AS expected_cash
                FROM cash_shifts t
                LEFT JOIN (SELECT p.cash_shift_id,
                                  SUM(CASE WHEN p.method = 'cash' THEN p.amount END)     AS cash,
                                  SUM(CASE WHEN p.method = 'card' THEN p.amount END)     AS card,
                                  SUM(CASE WHEN p.method = 'transfer' THEN p.amount END) AS transfer
                           FROM payments p JOIN sales s ON s.id = p.sale_id AND s.status <> 'cancelled'
                           GROUP BY p.cash_shift_id) pg ON pg.cash_shift_id = t.id
                LEFT JOIN (SELECT cash_shift_id, SUM(CASE WHEN type = 'cash_in' THEN amount END) AS cash_in,
                                  SUM(CASE WHEN type = 'cash_out' THEN amount END) AS cash_out
                           FROM cash_movements GROUP BY cash_shift_id) cm ON cm.cash_shift_id = t.id
                LEFT JOIN (SELECT cash_shift_id, SUM(total) AS refunds FROM sale_returns
                           WHERE refund_method = 'cash' GROUP BY cash_shift_id) sr ON sr.cash_shift_id = t.id
                LEFT JOIN (SELECT cash_shift_id, SUM(amount) AS supplier_paid FROM supplier_payments
                           WHERE method = 'cash' AND cash_shift_id IS NOT NULL GROUP BY cash_shift_id) sp ON sp.cash_shift_id = t.id
                SQL,
        ];
    }

    private function procedure(): string
    {
        return <<<'SQL'
            CREATE PROCEDURE sp_process_storage(IN p_user_id BIGINT UNSIGNED)
            BEGIN
              DECLARE v_abandoned BIGINT UNSIGNED;
              DECLARE v_total INT DEFAULT 0;
              DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
              SELECT id INTO v_abandoned FROM order_statuses WHERE code = 'abandoned';
              START TRANSACTION;
                DROP TEMPORARY TABLE IF EXISTS tmp_abandoned;
                CREATE TEMPORARY TABLE tmp_abandoned AS
                  SELECT r.service_order_id, o.status_id AS previous_status_id, r.storage_days
                  FROM v_storage_devices r
                  JOIN service_orders o ON o.id = r.service_order_id
                  WHERE r.alert = 'abandon';
                UPDATE service_orders o
                  JOIN tmp_abandoned t ON t.service_order_id = o.id AND o.status_id = t.previous_status_id
                   SET o.status_id = v_abandoned, o.abandoned_at = NOW(),
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
              COMMIT;
              SELECT v_total AS abandoned_orders;
            END
            SQL;
    }
};
