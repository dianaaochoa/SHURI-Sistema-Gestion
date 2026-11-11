<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sale_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('sale_id');
            $table->enum('type', ['product', 'service', 'service_order', 'deposit', 'additional_charge', 'storage_fee', 'custom_item']);
            $table->unsignedBigInteger('product_id')->nullable();
            $table->unsignedBigInteger('service_id')->nullable();
            $table->unsignedBigInteger('service_order_id')->nullable();
            $table->string('description', 200);
            $table->integer('quantity')->default(1);
            $table->decimal('unit_price', 10, 2)->default(0.00);
            $table->decimal('discount_pct', 5, 2)->default(0.00);
            $table->decimal('discount_amount', 10, 2)->default(0.00);
            $table->decimal('subtotal', 10, 2)->default(0.00);
            $table->integer('returned_quantity')->default(0);
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->index(['service_order_id'], 'sale_items_service_order_id_index');
            $table->index(['product_id'], 'sale_items_product_id_index');
            $table->index(['sale_id'], 'sale_items_sale_id_index');
            $table->foreign('service_order_id', 'sale_items_service_order_id_foreign')->references('id')->on('service_orders');
            $table->foreign('product_id', 'sale_items_product_id_foreign')->references('id')->on('products');
            $table->foreign('service_id', 'sale_items_service_id_foreign')->references('id')->on('services');
            $table->foreign('sale_id', 'sale_items_sale_id_foreign')->references('id')->on('sales');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_chk_1` CHECK (((`quantity` > 0) and (`returned_quantity` between 0 and `quantity`)))
            SQL);
        DB::statement(<<<'SQL'
            ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_chk_2` CHECK (((`discount_pct` between 0 and 100) and (`discount_amount` >= 0)))
            SQL);
        DB::statement(<<<'SQL'
            ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_chk_3` CHECK ((((`type` <> 'product') or (`product_id` is not null)) and ((`type` not in ('service_order','deposit','additional_charge','storage_fee')) or (`service_order_id` is not null))))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('sale_items');
    }
};
