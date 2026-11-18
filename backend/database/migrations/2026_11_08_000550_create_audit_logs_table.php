<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('module', 50);
            $table->string('action', 50);
            $table->string('table_name', 64)->nullable();
            $table->unsignedBigInteger('record_id')->nullable();
            $table->string('description', 255)->nullable();
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->string('ip', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['module', 'created_at'], 'audit_logs_module_created_at_index');
            $table->index(['table_name', 'record_id'], 'audit_logs_table_name_record_id_index');
            $table->index(['user_id', 'created_at'], 'audit_logs_user_id_created_at_index');
            $table->foreign('user_id', 'audit_logs_user_id_foreign')->references('id')->on('users');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
