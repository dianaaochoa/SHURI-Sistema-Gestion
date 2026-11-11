<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_parts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('service_order_id');
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('technician_id')->nullable();
            $table->unsignedBigInteger('part_request_id')->nullable();
            $table->enum('status', ['reserved', 'used', 'cancelled'])->default('used');
            $table->integer('quantity')->default(1);
            $table->integer('returned_quantity')->default(0);
            $table->decimal('unit_price', 10, 2)->nullable();
            $table->decimal('subtotal', 10, 2)->default(0.00);
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->index(['service_order_id'], 'order_parts_service_order_id_index');
            $table->index(['product_id', 'status'], 'order_parts_product_id_status_index');
            $table->foreign('service_order_id', 'order_parts_service_order_id_foreign')->references('id')->on('service_orders');
            $table->foreign('product_id', 'order_parts_product_id_foreign')->references('id')->on('products');
            $table->foreign('part_request_id', 'order_parts_part_request_id_foreign')->references('id')->on('part_requests');
            $table->foreign('technician_id', 'order_parts_technician_id_foreign')->references('id')->on('users');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `order_parts` ADD CONSTRAINT `order_parts_chk_1` CHECK (((`quantity` > 0) and (`returned_quantity` between 0 and `quantity`)))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('order_parts');
    }
};
