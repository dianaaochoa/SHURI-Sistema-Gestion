<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Tabla: sequences (original en español: secuencias)
 */
class Sequence extends Model
{
    protected $table = 'sequences';
    // Llave primaria compuesta (name, year): consúltala con where(); Eloquent no la maneja como clave.
    protected $primaryKey = null;
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;

    protected $fillable = [
        'name',
        'year',
        'value',
    ];

    protected $casts = [];
}
