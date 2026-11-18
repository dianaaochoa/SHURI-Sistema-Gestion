<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Escribe la auditoría inmutable del personal (audit_logs, AD8).
 * Siempre guarda la IP y el navegador de la petición actual.
 */
class AuditService
{
    public function __construct(private readonly Request $request) {}

    /**
     * @param  array<string, mixed>|null  $oldValues
     * @param  array<string, mixed>|null  $newValues
     */
    public function log(
        string $module,
        string $action,
        ?string $description = null,
        ?int $userId = null,
        ?string $tableName = null,
        ?int $recordId = null,
        ?array $oldValues = null,
        ?array $newValues = null,
    ): AuditLog {
        return AuditLog::create([
            'user_id' => $userId,
            'module' => $module,
            'action' => $action,
            'table_name' => $tableName,
            'record_id' => $recordId,
            'description' => $description ? Str::limit($description, 250) : null,
            'old_values' => $oldValues,
            'new_values' => $newValues,
            'ip' => $this->request->ip(),
            'user_agent' => Str::limit((string) $this->request->userAgent(), 250, ''),
        ]);
    }
}
