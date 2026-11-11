<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Test staff accounts for local development only (password: "password").
 * DatabaseSeeder runs it only when APP_ENV=local.
 */
class DemoUsersSeeder extends Seeder
{
    public function run(): void
    {
        $users = [
            ['role_id' => 1, 'name' => 'Administrador Shuri', 'username' => 'admin',  'email' => 'admin@shuri.test', 'max_discount_pct' => 100, 'authorization_code' => 'password'],
            ['role_id' => 2, 'name' => 'Jefe de Taller',      'username' => 'jefe',   'email' => 'jefe@shuri.test', 'max_discount_pct' => 20, 'authorization_code' => 'password'],
            ['role_id' => 3, 'name' => 'Carlos Técnico',      'username' => 'carlos', 'email' => 'carlos@shuri.test', 'specialty' => 'iPhone y microsoldadura'],
            ['role_id' => 3, 'name' => 'Laura Técnica',       'username' => 'laura',  'email' => 'laura@shuri.test', 'specialty' => 'Laptops y PC'],
            ['role_id' => 4, 'name' => 'Sofía Cajera',        'username' => 'sofia',  'email' => 'caja@shuri.test', 'cash_register_id' => 1, 'max_discount_pct' => 10],
        ];

        foreach ($users as $data) {
            User::create($data + ['password' => 'password', 'must_change_password' => false]);
        }
    }
}

