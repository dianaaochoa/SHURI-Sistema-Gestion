<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabla: audit_logs (original en español: auditoria)
 */
class AuditLog extends Model
{
    protected $table = 'audit_logs';
    const UPDATED_AT = null;

    protected $fillable = [
        'user_id',
        'module',
        'action',
        'table_name',
        'record_id',
        'description',
        'old_values',
        'new_values',
        'ip',
        'user_agent',
    ];

    protected $casts = [
        'old_values' => 'array',
        'new_values' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
