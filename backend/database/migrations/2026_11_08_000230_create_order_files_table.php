<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Tabla original (español): orden_archivos
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_files', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('service_order_id');
            $table->unsignedBigInteger('quote_id')->nullable();
            $table->unsignedBigInteger('warranty_id')->nullable();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->enum('type', ['intake', 'diagnosis', 'evidence', 'quote', 'progress', 'delivery', 'power_of_attorney', 'warranty']);
            $table->string('path', 255);
            $table->string('original_name', 150)->nullable();
            $table->string('mime_type', 80)->nullable();
            $table->unsignedInteger('size_bytes')->nullable();
            $table->boolean('visible_to_customer')->default(false);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['service_order_id', 'type'], 'order_files_service_order_id_type_index');
            $table->foreign('warranty_id', 'order_files_warranty_id_foreign')->references('id')->on('warranties');
            $table->foreign('service_order_id', 'order_files_service_order_id_foreign')->references('id')->on('service_orders');
            $table->foreign('quote_id', 'order_files_quote_id_foreign')->references('id')->on('quotes');
            $table->foreign('user_id', 'order_files_user_id_foreign')->references('id')->on('users');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_files');
    }
};
