<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Tabla original (español): pedido_detalles
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_order_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('purchase_order_id');
            $table->unsignedBigInteger('product_id')->nullable();
            $table->unsignedBigInteger('service_order_id')->nullable();
            $table->unsignedBigInteger('part_request_id')->nullable();
            $table->string('description', 200);
            $table->integer('quantity');
            $table->integer('received_quantity')->default(0);
            $table->decimal('unit_cost', 10, 2)->default(0.00);
            $table->decimal('subtotal', 10, 2)->storedAs('(`quantity` * `unit_cost`)');
            $table->index(['purchase_order_id'], 'purchase_order_items_purchase_order_id_index');
            $table->foreign('service_order_id', 'purchase_order_items_service_order_id_foreign')->references('id')->on('service_orders');
            $table->foreign('purchase_order_id', 'purchase_order_items_purchase_order_id_foreign')->references('id')->on('purchase_orders')->cascadeOnDelete();
            $table->foreign('product_id', 'purchase_order_items_product_id_foreign')->references('id')->on('products');
            $table->foreign('part_request_id', 'purchase_order_items_part_request_id_foreign')->references('id')->on('part_requests');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `purchase_order_items` ADD CONSTRAINT `purchase_order_items_chk_1` CHECK (((`quantity` > 0) and (`received_quantity` >= 0) and (`unit_cost` >= 0)))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_order_items');
    }
};
