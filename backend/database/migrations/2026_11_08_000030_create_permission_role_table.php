<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('permission_role', function (Blueprint $table) {
            $table->unsignedBigInteger('role_id');
            $table->unsignedBigInteger('permission_id');
            $table->decimal('limit_pct', 5, 2)->nullable();
            $table->string('scope', 40)->nullable();
            $table->primary(['role_id', 'permission_id']);
            $table->foreign('permission_id', 'permission_role_permission_id_foreign')->references('id')->on('permissions')->cascadeOnDelete();
            $table->foreign('role_id', 'permission_role_role_id_foreign')->references('id')->on('roles')->cascadeOnDelete();
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `permission_role` ADD CONSTRAINT `permission_role_chk_1` CHECK (((`limit_pct` is null) or (`limit_pct` between 0 and 100)))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('permission_role');
    }
};
