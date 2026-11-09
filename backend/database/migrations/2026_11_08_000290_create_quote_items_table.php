<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Tabla original (español): presupuesto_detalles
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('quote_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('quote_id');
            $table->enum('type', ['part', 'labor', 'service', 'other'])->default('part');
            $table->unsignedBigInteger('product_id')->nullable();
            $table->unsignedBigInteger('service_id')->nullable();
            $table->unsignedBigInteger('labor_level_id')->nullable();
            $table->string('concept', 150);
            $table->integer('quantity')->default(1);
            $table->decimal('unit_cost', 10, 2)->nullable();
            $table->decimal('unit_price', 10, 2)->default(0.00);
            $table->decimal('subtotal', 10, 2)->storedAs('(`quantity` * `unit_price`)');
            $table->boolean('out_of_stock')->default(false);
            $table->date('expected_arrival_date')->nullable();
            $table->enum('origin', ['technician', 'head_technician'])->default('technician');
            $table->index(['quote_id'], 'quote_items_quote_id_index');
            $table->index(['product_id'], 'quote_items_product_id_index');
            $table->foreign('labor_level_id', 'quote_items_labor_level_id_foreign')->references('id')->on('labor_levels');
            $table->foreign('quote_id', 'quote_items_quote_id_foreign')->references('id')->on('quotes')->cascadeOnDelete();
            $table->foreign('product_id', 'quote_items_product_id_foreign')->references('id')->on('products');
            $table->foreign('service_id', 'quote_items_service_id_foreign')->references('id')->on('services');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `quote_items` ADD CONSTRAINT `quote_items_chk_1` CHECK (((`quantity` > 0) and (`unit_price` >= 0) and ((`unit_cost` is null) or (`unit_cost` >= 0))))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('quote_items');
    }
};
