<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla: message_templates (original en español: plantillas_mensaje)
 */
class MessageTemplate extends Model
{
    protected $table = 'message_templates';

    protected $fillable = [
        'code',
        'name',
        'sent_when',
        'via_portal',
        'via_email',
        'is_active',
        'email_subject',
        'body',
        'updated_by',
    ];

    protected $casts = [
        'via_portal' => 'boolean',
        'via_email' => 'boolean',
        'is_active' => 'boolean',
    ];

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function sentEmails(): HasMany
    {
        return $this->hasMany(SentEmail::class, 'message_template_id');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class, 'message_template_id');
    }
}
