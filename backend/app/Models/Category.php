<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabla: categories (original en español: categorias)
 */
class Category extends Model
{
    protected $table = 'categories';

    protected $fillable = [
        'name',
        'type',
    ];

    protected $casts = [];

    public function products(): HasMany
    {
        return $this->hasMany(Product::class, 'category_id');
    }
}
