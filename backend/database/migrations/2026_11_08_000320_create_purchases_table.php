<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Tabla original (español): compras
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchases', function (Blueprint $table) {
            $table->id();
            $table->string('folio', 20);
            $table->unsignedBigInteger('supplier_id');
            $table->unsignedBigInteger('purchase_order_id')->nullable();
            $table->unsignedBigInteger('user_id');
            $table->string('supplier_invoice', 40)->nullable();
            $table->date('purchase_date');
            $table->decimal('subtotal', 10, 2)->default(0.00);
            $table->decimal('tax', 10, 2)->default(0.00);
            $table->decimal('total', 10, 2)->storedAs('(`subtotal` + `tax`)');
            $table->decimal('amount_paid', 10, 2)->default(0.00);
            $table->enum('payment_status', ['pending', 'partial', 'paid'])->default('pending');
            $table->date('due_date')->nullable();
            $table->string('notes', 255)->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->index(['supplier_id', 'payment_status'], 'purchases_supplier_id_payment_status_index');
            $table->unique(['folio'], 'purchases_folio_unique');
            $table->foreign('purchase_order_id', 'purchases_purchase_order_id_foreign')->references('id')->on('purchase_orders');
            $table->foreign('supplier_id', 'purchases_supplier_id_foreign')->references('id')->on('suppliers');
            $table->foreign('user_id', 'purchases_user_id_foreign')->references('id')->on('users');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `purchases` ADD CONSTRAINT `purchases_chk_1` CHECK (((`subtotal` >= 0) and (`tax` >= 0) and (`amount_paid` >= 0)))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('purchases');
    }
};
