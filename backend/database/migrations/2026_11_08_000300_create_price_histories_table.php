<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Tabla original (español): historial_precios
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('price_histories', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('user_id');
            $table->decimal('old_purchase_price', 10, 2);
            $table->decimal('new_purchase_price', 10, 2);
            $table->decimal('old_sale_price', 10, 2);
            $table->decimal('new_sale_price', 10, 2);
            $table->string('reason', 255)->nullable();
            $table->char('batch_uuid', 36)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['product_id', 'created_at'], 'price_histories_product_id_created_at_index');
            $table->foreign('product_id', 'price_histories_product_id_foreign')->references('id')->on('products');
            $table->foreign('user_id', 'price_histories_user_id_foreign')->references('id')->on('users');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('price_histories');
    }
};
