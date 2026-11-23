<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Base para probar el sistema a mano: catálogos, un solo administrador y productos
 * con existencias. Los demás usuarios se dan de alta desde la pantalla de Usuarios.
 *
 * php artisan migrate:fresh --seeder=PruebasSeeder
 *
 * En una base que ya tiene usuarios, solo los productos: php artisan db:seed --class=ProductosPruebaSeeder
 *
 * El administrador entra con su correo y la contraseña temporal de abajo; en el primer
 * inicio de sesión el sistema le pide crear su contraseña y elegir su pregunta secreta.
 */
class PruebasSeeder extends Seeder
{
    /** Contraseña temporal del administrador (se cambia en el primer inicio de sesión). */
    public const ADMIN_PASSWORD = 'Shuri2026';

    public function run(): void
    {
        $this->call(CatalogSeeder::class);

        User::create([
            'role_id' => 1,
            'name' => 'Brisa Luna',
            'username' => 'brisa',
            'email' => 'brisa.lunaa05@gmail.com',
            'password' => self::ADMIN_PASSWORD,
            'must_change_password' => true,
            'max_discount_pct' => 100,
        ]);

        // Productos con existencias (entran por el kardex a nombre del administrador)
        $this->call(ProductosPruebaSeeder::class);
    }
}
