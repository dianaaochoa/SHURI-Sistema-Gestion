<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sale_return_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('sale_return_id');
            $table->unsignedBigInteger('sale_item_id');
            $table->integer('quantity');
            $table->decimal('amount', 10, 2);
            $table->boolean('returns_to_inventory')->default(true);
            $table->foreign('sale_return_id', 'sale_return_items_sale_return_id_foreign')->references('id')->on('sale_returns')->cascadeOnDelete();
            $table->foreign('sale_item_id', 'sale_return_items_sale_item_id_foreign')->references('id')->on('sale_items');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `sale_return_items` ADD CONSTRAINT `sale_return_items_chk_1` CHECK (((`quantity` > 0) and (`amount` >= 0)))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('sale_return_items');
    }
};
