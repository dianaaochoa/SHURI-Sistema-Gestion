<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_orders', function (Blueprint $table) {
            $table->id();
            $table->string('folio', 20);
            $table->unsignedBigInteger('supplier_id');
            $table->unsignedBigInteger('requested_by');
            $table->enum('status', ['draft', 'sent', 'partially_received', 'received', 'cancelled'])->default('draft');
            $table->date('expected_date')->nullable();
            $table->enum('payment_terms', ['cash_on_delivery', 'transfer', 'credit'])->default('cash_on_delivery');
            $table->enum('receive_at', ['counter', 'workshop'])->default('counter');
            $table->boolean('notify_technician')->default(true);
            $table->string('supplier_folio', 40)->nullable();
            $table->decimal('estimated_total', 10, 2)->default(0.00);
            $table->string('notes', 255)->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->index(['status'], 'purchase_orders_status_index');
            $table->unique(['folio'], 'purchase_orders_folio_unique');
            $table->foreign('supplier_id', 'purchase_orders_supplier_id_foreign')->references('id')->on('suppliers');
            $table->foreign('requested_by', 'purchase_orders_requested_by_foreign')->references('id')->on('users');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_orders');
    }
};
