<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('category_id');
            $table->unsignedBigInteger('supplier_id')->nullable();
            $table->string('sku', 40);
            $table->string('barcode', 50)->nullable();
            $table->string('name', 150);
            $table->string('brand', 60)->nullable();
            $table->string('compatible_with', 150)->nullable();
            $table->string('description', 255)->nullable();
            $table->enum('type', ['part', 'accessory', 'consumable']);
            $table->boolean('sellable_at_counter')->default(true);
            $table->boolean('usable_in_workshop')->default(true);
            $table->decimal('purchase_price', 10, 2)->default(0.00);
            $table->decimal('sale_price', 10, 2)->default(0.00);
            $table->integer('stock')->default(0);
            $table->integer('min_stock')->default(0);
            $table->string('location', 40)->nullable();
            $table->string('image_path', 255)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->index(['name'], 'products_name_index');
            $table->index(['type', 'is_active'], 'products_type_is_active_index');
            $table->unique(['barcode'], 'products_barcode_unique');
            $table->unique(['sku'], 'products_sku_unique');
            $table->foreign('category_id', 'products_category_id_foreign')->references('id')->on('categories');
            $table->foreign('supplier_id', 'products_supplier_id_foreign')->references('id')->on('suppliers');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `products` ADD CONSTRAINT `products_chk_1` CHECK (((`purchase_price` >= 0) and (`sale_price` >= 0)))
            SQL);
        DB::statement(<<<'SQL'
            ALTER TABLE `products` ADD CONSTRAINT `products_chk_2` CHECK ((`stock` >= 0))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
