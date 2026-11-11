<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla: order_statuses (original en español: estados_orden)
 */
class OrderStatus extends Model
{
    // Códigos que inserta CatalogSeeder (diagrama de estados del README §14.4)
    public const RECEIVED = 'received';

    public const ASSIGNED = 'assigned';

    public const DIAGNOSING = 'diagnosing';

    public const AWAITING_CUSTOMER = 'awaiting_customer';

    public const QUOTING = 'quoting';

    public const QUOTE_PENDING = 'quote_pending';

    public const IN_REPAIR = 'in_repair';

    public const QUOTE_REJECTED = 'quote_rejected';

    public const NOT_REPAIRABLE = 'not_repairable';

    public const READY_FOR_PICKUP = 'ready_for_pickup';

    public const DELIVERED = 'delivered';

    public const ABANDONED = 'abandoned';

    public const DISPOSED = 'disposed';

    public const CANCELLED = 'cancelled';

    /** @var array<string, int>|null código => id, se carga una vez por petición */
    private static ?array $idsByCode = null;

    /** Id de un estado por su código, p. ej. OrderStatus::idFor(OrderStatus::ASSIGNED). */
    public static function idFor(string $code): int
    {
        self::$idsByCode ??= static::query()->pluck('id', 'code')->map(fn ($id) => (int) $id)->all();

        return self::$idsByCode[$code] ?? throw new \InvalidArgumentException("Estado de orden desconocido: {$code}");
    }

    /** Olvida los ids en caché (las pruebas vuelven a sembrar el catálogo). */
    public static function flushIds(): void
    {
        self::$idsByCode = null;
    }

    protected $table = 'order_statuses';

    protected $primaryKey = 'id';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'id',
        'code',
        'name',
        'customer_message',
        'color_hex',
        'sort_order',
        'portal_step',
        'is_final',
        'allows_work',
        'awaiting_pickup',
    ];

    protected $casts = [
        'is_final' => 'boolean',
        'allows_work' => 'boolean',
        'awaiting_pickup' => 'boolean',
    ];

    public function previousStatusOrderLogs(): HasMany
    {
        return $this->hasMany(OrderLog::class, 'previous_status_id');
    }

    public function newStatusOrderLogs(): HasMany
    {
        return $this->hasMany(OrderLog::class, 'new_status_id');
    }

    public function serviceOrders(): HasMany
    {
        return $this->hasMany(ServiceOrder::class, 'status_id');
    }
}
