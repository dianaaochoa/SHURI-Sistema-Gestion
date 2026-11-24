<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Rol Super usuario: por encima del administrador, con todos los permisos.
 * Solo existe una cuenta (se crea con `php artisan shuri:create-superuser`) y ningún
 * administrador puede verla, editarla, bloquearla ni asignarle ese rol a nadie.
 *
 * insertOrIgnore: en una instalación nueva el CatalogSeeder también lo crea.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        DB::table('roles')->insertOrIgnore([
            'id' => 5, 'slug' => 'super_admin', 'name' => 'Super usuario',
            'description' => 'Acceso total al sistema; da de alta al personal y a los administradores',
            'created_at' => $now, 'updated_at' => $now,
        ]);

        // Todos los permisos existentes (si la tabla aún está vacía, los asigna el seeder)
        DB::table('permission_role')->insertOrIgnore(
            DB::table('permissions')->pluck('id')->map(fn ($id) => ['role_id' => 5, 'permission_id' => $id])->all()
        );
    }

    public function down(): void
    {
        DB::table('users')->where('role_id', 5)->update(['role_id' => 1]);
        DB::table('permission_role')->where('role_id', 5)->delete();
        DB::table('roles')->where('id', 5)->delete();
    }
};
