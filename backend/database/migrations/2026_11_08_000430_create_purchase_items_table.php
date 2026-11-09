<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Tabla original (español): compra_detalles
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('purchase_id');
            $table->unsignedBigInteger('product_id');
            $table->integer('quantity');
            $table->decimal('unit_cost', 10, 2);
            $table->decimal('subtotal', 10, 2)->storedAs('(`quantity` * `unit_cost`)');
            $table->index(['purchase_id'], 'purchase_items_purchase_id_index');
            $table->foreign('purchase_id', 'purchase_items_purchase_id_foreign')->references('id')->on('purchases')->cascadeOnDelete();
            $table->foreign('product_id', 'purchase_items_product_id_foreign')->references('id')->on('products');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `purchase_items` ADD CONSTRAINT `purchase_items_chk_1` CHECK (((`quantity` > 0) and (`unit_cost` >= 0)))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_items');
    }
};
