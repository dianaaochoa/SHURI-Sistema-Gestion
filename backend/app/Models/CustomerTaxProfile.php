<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabla: customer_tax_profiles (original en español: cliente_datos_fiscales)
 */
class CustomerTaxProfile extends Model
{
    protected $table = 'customer_tax_profiles';

    protected $fillable = [
        'customer_id',
        'rfc',
        'business_name',
        'tax_regime',
        'postal_code',
        'cfdi_use',
        'invoice_email',
        'is_default',
    ];

    protected $casts = [
        'is_default' => 'boolean',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }
}
