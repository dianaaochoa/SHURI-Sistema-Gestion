<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla: order_statuses (original en español: estados_orden)
 */
class OrderStatus extends Model
{
    // Codes seeded by CatalogSeeder (README §14.4 state diagram)
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

    /** @var array<string, int>|null code => id, loaded once per request */
    private static ?array $idsByCode = null;

    /** Id of a status by its code, e.g. OrderStatus::idFor(OrderStatus::ASSIGNED). */
    public static function idFor(string $code): int
    {
        self::$idsByCode ??= static::query()->pluck('id', 'code')->map(fn ($id) => (int) $id)->all();

        return self::$idsByCode[$code] ?? throw new \InvalidArgumentException("Estado de orden desconocido: {$code}");
    }

    /** Forget the cached ids (tests reseed the catalog between cases). */
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
