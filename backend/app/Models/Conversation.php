<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla: conversations (original en español: conversaciones)
 */
class Conversation extends Model
{
    protected $table = 'conversations';

    protected $fillable = [
        'customer_id',
        'service_order_id',
        'status',
        'handled_by',
        'awaiting_reply',
        'last_message_at',
        'closed_at',
    ];

    protected $casts = [
        'awaiting_reply' => 'boolean',
        'last_message_at' => 'datetime',
        'closed_at' => 'datetime',
    ];

    public function handledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'handled_by');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    public function serviceOrder(): BelongsTo
    {
        return $this->belongsTo(ServiceOrder::class, 'service_order_id');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class, 'conversation_id');
    }
}
