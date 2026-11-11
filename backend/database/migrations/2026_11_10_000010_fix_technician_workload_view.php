<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/*
 * Corrige v_technician_workload: el filtro de órdenes estaba en el WHERE de un
 * LEFT JOIN, por lo que un técnico con todas sus órdenes entregadas desaparecía
 * de la lista en lugar de mostrar 0 órdenes activas. Los equipos en abandono
 * tampoco cuentan como carga de trabajo.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE VIEW v_technician_workload AS
            SELECT u.id AS technician_id, u.name AS technician, u.specialty,
                   COUNT(o.id) AS active_orders,
                   COALESCE(SUM(o.priority IN ('high', 'urgent')), 0) AS priority_orders,
                   COALESCE(SUM(s.code = 'diagnosing'), 0) AS diagnosing,
                   COALESCE(SUM(o.is_paused = 1), 0) AS paused
            FROM users u
            JOIN roles r ON r.id = u.role_id AND r.slug = 'technician'
            LEFT JOIN (service_orders o
                       JOIN order_statuses s ON s.id = o.status_id
                        AND s.is_final = 0 AND s.awaiting_pickup = 0 AND s.code <> 'abandoned')
                   ON o.technician_id = u.id
            WHERE u.is_active = 1
            GROUP BY u.id, u.name, u.specialty
            SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
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
            SQL);
    }
};
