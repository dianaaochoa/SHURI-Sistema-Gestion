<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_movements', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('user_id')->nullable();
            $table->unsignedBigInteger('authorized_by')->nullable();
            $table->enum('type', ['stock_in', 'adjustment', 'sale', 'workshop_use', 'sale_return', 'workshop_return', 'supplier_return', 'shrinkage']);
            $table->integer('quantity');
            $table->integer('previous_stock');
            $table->integer('new_stock');
            $table->unsignedBigInteger('sale_id')->nullable();
            $table->unsignedBigInteger('service_order_id')->nullable();
            $table->unsignedBigInteger('purchase_id')->nullable();
            $table->unsignedBigInteger('sale_return_id')->nullable();
            $table->unsignedBigInteger('reference_id')->nullable();
            $table->string('reason', 255)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['product_id', 'created_at'], 'inventory_movements_product_id_created_at_index');
            $table->index(['type'], 'inventory_movements_type_index');
            $table->foreign('authorized_by', 'inventory_movements_authorized_by_foreign')->references('id')->on('users');
            $table->foreign('purchase_id', 'inventory_movements_purchase_id_foreign')->references('id')->on('purchases');
            $table->foreign('sale_return_id', 'inventory_movements_sale_return_id_foreign')->references('id')->on('sale_returns');
            $table->foreign('service_order_id', 'inventory_movements_service_order_id_foreign')->references('id')->on('service_orders');
            $table->foreign('product_id', 'inventory_movements_product_id_foreign')->references('id')->on('products');
            $table->foreign('user_id', 'inventory_movements_user_id_foreign')->references('id')->on('users');
            $table->foreign('sale_id', 'inventory_movements_sale_id_foreign')->references('id')->on('sales');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_chk_1` CHECK (((`new_stock` = (`previous_stock` + `quantity`)) and (`new_stock` >= 0)))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_movements');
    }
};
