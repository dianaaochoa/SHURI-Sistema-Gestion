<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla: service_orders (original en español: ordenes_servicio)
 */
class ServiceOrder extends Model
{
    protected $table = 'service_orders';

    protected $fillable = [
        'folio',
        'customer_id',
        'device_id',
        'status_id',
        'priority',
        'cash_register_id',
        'reported_issue',
        'received_accessories',
        'intake_checklist',
        'physical_condition',
        'device_pin',
        'diagnosis',
        'failure_cause',
        'labor_level_id',
        'estimated_minutes',
        'diagnosis_due_at',
        'is_paused',
        'pause_reason',
        'no_repair_reason',
        'charge_inspection',
        'estimated_cost',
        'deposit',
        'labor_cost',
        'parts_cost',
        'is_paid',
        'received_by',
        'assigned_by',
        'technician_id',
        'updated_by',
        'location',
        'sent_to_storage_at',
        'storage_fee_waived',
        'waived_by',
        'waiver_reason',
        'storage_fee',
        'warranty_days',
        'warranty_until',
        'delivered_by',
        'picked_up_by_name',
        'picked_up_id_type',
        'picked_up_id_number',
        'picked_up_relationship',
        'has_power_of_attorney',
        'has_owner_id_copy',
        'delivery_checklist',
        'rating',
        'rating_tags',
        'rating_comment',
        'rated_at',
        'promised_date',
        'assigned_at',
        'quoting_started_at',
        'approved_at',
        'ready_at',
        'delivered_at',
        'abandoned_at',
        'disposed_at',
        'disposed_by',
    ];

    protected $hidden = [
        'device_pin',
    ];

    protected $casts = [
        'intake_checklist' => 'array',
        'device_pin' => 'encrypted',
        'diagnosis_due_at' => 'datetime',
        'is_paused' => 'boolean',
        'charge_inspection' => 'boolean',
        'estimated_cost' => 'decimal:2',
        'deposit' => 'decimal:2',
        'labor_cost' => 'decimal:2',
        'parts_cost' => 'decimal:2',
        'total' => 'decimal:2',
        'is_paid' => 'boolean',
        'sent_to_storage_at' => 'datetime',
        'storage_fee_waived' => 'boolean',
        'storage_fee' => 'decimal:2',
        'warranty_until' => 'date',
        'has_power_of_attorney' => 'boolean',
        'has_owner_id_copy' => 'boolean',
        'delivery_checklist' => 'array',
        'rating_tags' => 'array',
        'rated_at' => 'datetime',
        'promised_date' => 'date',
        'assigned_at' => 'datetime',
        'quoting_started_at' => 'datetime',
        'approved_at' => 'datetime',
        'ready_at' => 'datetime',
        'delivered_at' => 'datetime',
        'abandoned_at' => 'datetime',
        'disposed_at' => 'datetime',
    ];

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function assignedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }

    public function cashRegister(): BelongsTo
    {
        return $this->belongsTo(CashRegister::class, 'cash_register_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    public function waivedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'waived_by');
    }

    public function disposedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'disposed_by');
    }

    public function deliveredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delivered_by');
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class, 'device_id');
    }

    public function status(): BelongsTo
    {
        return $this->belongsTo(OrderStatus::class, 'status_id');
    }

    public function laborLevel(): BelongsTo
    {
        return $this->belongsTo(LaborLevel::class, 'labor_level_id');
    }

    public function receivedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public function technician(): BelongsTo
    {
        return $this->belongsTo(User::class, 'technician_id');
    }

    public function orderLogs(): HasMany
    {
        return $this->hasMany(OrderLog::class, 'service_order_id');
    }

    public function conversations(): HasMany
    {
        return $this->hasMany(Conversation::class, 'service_order_id');
    }

    public function sentEmails(): HasMany
    {
        return $this->hasMany(SentEmail::class, 'service_order_id');
    }

    public function warranties(): HasMany
    {
        return $this->hasMany(Warranty::class, 'service_order_id');
    }

    public function inventoryMovements(): HasMany
    {
        return $this->hasMany(InventoryMovement::class, 'service_order_id');
    }

    public function orderFiles(): HasMany
    {
        return $this->hasMany(OrderFile::class, 'service_order_id');
    }

    public function orderParts(): HasMany
    {
        return $this->hasMany(OrderPart::class, 'service_order_id');
    }

    public function orderTimeLogs(): HasMany
    {
        return $this->hasMany(OrderTimeLog::class, 'service_order_id');
    }

    public function purchaseOrderItems(): HasMany
    {
        return $this->hasMany(PurchaseOrderItem::class, 'service_order_id');
    }

    public function quotes(): HasMany
    {
        return $this->hasMany(Quote::class, 'service_order_id');
    }

    public function partRequests(): HasMany
    {
        return $this->hasMany(PartRequest::class, 'service_order_id');
    }

    public function saleItems(): HasMany
    {
        return $this->hasMany(SaleItem::class, 'service_order_id');
    }
}
