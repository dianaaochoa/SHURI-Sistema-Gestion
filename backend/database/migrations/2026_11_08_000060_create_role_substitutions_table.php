<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('role_substitutions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('role_id');
            $table->unsignedBigInteger('substitutes_user_id')->nullable();
            $table->string('reason', 255);
            $table->dateTime('starts_at');
            $table->dateTime('ends_at')->nullable();
            $table->unsignedBigInteger('assigned_by');
            $table->unsignedBigInteger('revoked_by')->nullable();
            $table->dateTime('revoked_at')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->index(['role_id'], 'role_substitutions_role_id_index');
            $table->index(['user_id', 'starts_at', 'ends_at'], 'role_substitutions_user_id_starts_at_ends_at_index');
            $table->foreign('assigned_by', 'role_substitutions_assigned_by_foreign')->references('id')->on('users');
            $table->foreign('revoked_by', 'role_substitutions_revoked_by_foreign')->references('id')->on('users');
            $table->foreign('role_id', 'role_substitutions_role_id_foreign')->references('id')->on('roles');
            $table->foreign('substitutes_user_id', 'role_substitutions_substitutes_user_id_foreign')->references('id')->on('users');
            $table->foreign('user_id', 'role_substitutions_user_id_foreign')->references('id')->on('users');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `role_substitutions` ADD CONSTRAINT `role_substitutions_chk_1` CHECK (((`ends_at` is null) or (`ends_at` > `starts_at`)))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('role_substitutions');
    }
};
