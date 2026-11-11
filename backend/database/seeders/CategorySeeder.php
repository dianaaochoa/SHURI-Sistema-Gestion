<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Categorías del catálogo (README §15: Pantallas, Baterías, Audífonos…),
 * agrupadas en los tres tipos de producto: refacción, accesorio y consumible.
 * Usa insertOrIgnore para poder correrlo en una base que ya tiene datos:
 * php artisan db:seed --class=CategorySeeder
 */
class CategorySeeder extends Seeder
{
    public function run(): void
    {
        $now = now();

        $categories = [
            ['Pantallas', 'part'],
            ['Baterías', 'part'],
            ['Puertos y conectores', 'part'],
            ['Cámaras y bocinas', 'part'],
            ['Placas y componentes', 'part'],
            ['Audífonos', 'accessory'],
            ['Cables y cargadores', 'accessory'],
            ['Fundas y micas', 'accessory'],
            ['Mouses y teclados', 'accessory'],
            ['Consumibles de taller', 'consumable'],
        ];

        DB::table('categories')->insertOrIgnore(array_map(fn ($c) => [
            'name' => $c[0], 'type' => $c[1], 'created_at' => $now, 'updated_at' => $now,
        ], $categories));
    }
}
