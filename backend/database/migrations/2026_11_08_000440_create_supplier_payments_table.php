<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Tabla original (español): pagos_proveedor
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('supplier_payments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('purchase_id');
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('cash_shift_id')->nullable();
            $table->enum('method', ['cash', 'card', 'transfer']);
            $table->decimal('amount', 10, 2);
            $table->string('reference', 80)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['purchase_id'], 'supplier_payments_purchase_id_index');
            $table->foreign('purchase_id', 'supplier_payments_purchase_id_foreign')->references('id')->on('purchases');
            $table->foreign('cash_shift_id', 'supplier_payments_cash_shift_id_foreign')->references('id')->on('cash_shifts');
            $table->foreign('user_id', 'supplier_payments_user_id_foreign')->references('id')->on('users');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_chk_1` CHECK ((`amount` > 0))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_payments');
    }
};
