<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Tabla original (español): orden_tiempos
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_time_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('service_order_id');
            $table->unsignedBigInteger('technician_id');
            $table->enum('type', ['diagnosis', 'repair', 'warranty'])->default('repair');
            $table->dateTime('starts_at');
            $table->dateTime('ends_at')->nullable();
            $table->string('pause_reason', 255)->nullable();
            $table->integer('minutes')->storedAs('timestampdiff(MINUTE,`starts_at`,`ends_at`)');
            $table->unsignedBigInteger('active_technician_id')->storedAs('if((`ends_at` is null),`technician_id`,NULL)');
            $table->index(['service_order_id'], 'order_time_logs_service_order_id_index');
            $table->unique(['active_technician_id'], 'order_time_logs_active_technician_id_unique');
            $table->foreign('service_order_id', 'order_time_logs_service_order_id_foreign')->references('id')->on('service_orders');
            $table->foreign('technician_id', 'order_time_logs_technician_id_foreign')->references('id')->on('users');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_time_logs');
    }
};
