<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('settings')->where('key', 'staff_max_attempts')->update([
            'value' => '3',
            'updated_at' => now(),
        ]);
        DB::table('settings')->where('key', 'staff_lock_minutes')->update([
            'value' => '0',
            'description' => 'Minutos de bloqueo del personal (0 = hasta que el administrador la desbloquee)',
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        DB::table('settings')->where('key', 'staff_max_attempts')->update(['value' => '5', 'updated_at' => now()]);
        DB::table('settings')->where('key', 'staff_lock_minutes')->update([
            'value' => '15',
            'description' => 'Minutos de bloqueo de la cuenta del personal',
            'updated_at' => now(),
        ]);
    }
};
