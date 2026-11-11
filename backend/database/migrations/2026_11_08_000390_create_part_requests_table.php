<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('part_requests', function (Blueprint $table) {
            $table->id();
            $table->string('folio', 20);
            $table->unsignedBigInteger('service_order_id')->nullable();
            $table->unsignedBigInteger('technician_id');
            $table->unsignedBigInteger('product_id')->nullable();
            $table->string('description', 200);
            $table->integer('quantity')->default(1);
            $table->enum('urgency', ['normal', 'urgent'])->default('normal');
            $table->enum('status', ['pending', 'approved', 'delivered', 'ordered', 'rejected', 'cancelled'])->default('pending');
            $table->unsignedBigInteger('handled_by')->nullable();
            $table->dateTime('handled_at')->nullable();
            $table->unsignedBigInteger('purchase_order_id')->nullable();
            $table->string('rejection_reason', 255)->nullable();
            $table->string('notes', 255)->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->index(['status', 'created_at'], 'part_requests_status_created_at_index');
            $table->index(['technician_id', 'status'], 'part_requests_technician_id_status_index');
            $table->unique(['folio'], 'part_requests_folio_unique');
            $table->foreign('handled_by', 'part_requests_handled_by_foreign')->references('id')->on('users');
            $table->foreign('service_order_id', 'part_requests_service_order_id_foreign')->references('id')->on('service_orders');
            $table->foreign('purchase_order_id', 'part_requests_purchase_order_id_foreign')->references('id')->on('purchase_orders');
            $table->foreign('product_id', 'part_requests_product_id_foreign')->references('id')->on('products');
            $table->foreign('technician_id', 'part_requests_technician_id_foreign')->references('id')->on('users');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `part_requests` ADD CONSTRAINT `part_requests_chk_1` CHECK ((`quantity` > 0))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('part_requests');
    }
};
