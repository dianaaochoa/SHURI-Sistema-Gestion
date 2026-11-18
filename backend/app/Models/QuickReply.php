<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Tabla: quick_replies (original en español: respuestas_rapidas)
 */
class QuickReply extends Model
{
    protected $table = 'quick_replies';

    protected $fillable = [
        'title',
        'body',
        'sort_order',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];
}
