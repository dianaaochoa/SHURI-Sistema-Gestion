<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabla: order_files (original en español: orden_archivos)
 */
class OrderFile extends Model
{
    protected $table = 'order_files';
    const UPDATED_AT = null;

    protected $fillable = [
        'service_order_id',
        'quote_id',
        'warranty_id',
        'user_id',
        'type',
        'path',
        'original_name',
        'mime_type',
        'size_bytes',
        'visible_to_customer',
    ];

    protected $casts = [
        'visible_to_customer' => 'boolean',
    ];

    public function warranty(): BelongsTo
    {
        return $this->belongsTo(Warranty::class, 'warranty_id');
    }

    public function serviceOrder(): BelongsTo
    {
        return $this->belongsTo(ServiceOrder::class, 'service_order_id');
    }

    public function quote(): BelongsTo
    {
        return $this->belongsTo(Quote::class, 'quote_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
