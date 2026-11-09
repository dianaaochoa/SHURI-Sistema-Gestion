<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Tabla original (español): bitacora_orden
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('service_order_id');
            $table->unsignedBigInteger('user_id')->nullable();
            $table->enum('type', ['intake', 'status_change', 'assignment', 'diagnosis', 'quoting', 'note', 'part', 'quote', 'customer_response', 'info_request', 'pause', 'resume', 'warranty', 'storage', 'abandonment', 'disposal', 'delivery', 'rating', 'email']);
            $table->unsignedBigInteger('previous_status_id')->nullable();
            $table->unsignedBigInteger('new_status_id')->nullable();
            $table->unsignedBigInteger('quote_id')->nullable();
            $table->unsignedBigInteger('warranty_id')->nullable();
            $table->text('description');
            $table->boolean('visible_to_customer')->default(false);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['service_order_id', 'created_at'], 'order_logs_service_order_id_created_at_index');
            $table->foreign('previous_status_id', 'order_logs_previous_status_id_foreign')->references('id')->on('order_statuses');
            $table->foreign('new_status_id', 'order_logs_new_status_id_foreign')->references('id')->on('order_statuses');
            $table->foreign('warranty_id', 'order_logs_warranty_id_foreign')->references('id')->on('warranties');
            $table->foreign('service_order_id', 'order_logs_service_order_id_foreign')->references('id')->on('service_orders');
            $table->foreign('quote_id', 'order_logs_quote_id_foreign')->references('id')->on('quotes');
            $table->foreign('user_id', 'order_logs_user_id_foreign')->references('id')->on('users');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_logs');
    }
};
