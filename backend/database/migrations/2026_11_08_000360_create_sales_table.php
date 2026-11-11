<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales', function (Blueprint $table) {
            $table->id();
            $table->string('folio', 20);
            $table->unsignedBigInteger('cash_shift_id')->nullable();
            $table->unsignedBigInteger('cash_register_id')->nullable();
            $table->unsignedBigInteger('cashier_id');
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->unsignedBigInteger('authorized_by')->nullable();
            $table->decimal('subtotal', 10, 2)->default(0.00);
            $table->decimal('discount', 10, 2)->default(0.00);
            $table->decimal('tax', 10, 2)->default(0.00);
            $table->decimal('total', 10, 2)->storedAs('((`subtotal` - `discount`) + `tax`)');
            $table->enum('status', ['open', 'on_hold', 'paid', 'cancelled', 'returned', 'partially_returned'])->default('open');
            $table->string('hold_note', 120)->nullable();
            $table->enum('receipt_type', ['ticket', 'invoice'])->default('ticket');
            $table->unsignedBigInteger('invoice_id')->nullable();
            $table->dateTime('paid_at')->nullable();
            $table->unsignedBigInteger('cancelled_by')->nullable();
            $table->dateTime('cancelled_at')->nullable();
            $table->string('cancellation_reason', 255)->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->index(['cashier_id'], 'sales_cashier_id_index');
            $table->index(['status', 'created_at'], 'sales_status_created_at_index');
            $table->index(['cash_shift_id'], 'sales_cash_shift_id_index');
            $table->unique(['folio'], 'sales_folio_unique');
            $table->foreign('authorized_by', 'sales_authorized_by_foreign')->references('id')->on('users');
            $table->foreign('cash_register_id', 'sales_cash_register_id_foreign')->references('id')->on('cash_registers');
            $table->foreign('cashier_id', 'sales_cashier_id_foreign')->references('id')->on('users');
            $table->foreign('cancelled_by', 'sales_cancelled_by_foreign')->references('id')->on('users');
            $table->foreign('customer_id', 'sales_customer_id_foreign')->references('id')->on('customers');
            $table->foreign('invoice_id', 'sales_invoice_id_foreign')->references('id')->on('invoices');
            $table->foreign('cash_shift_id', 'sales_cash_shift_id_foreign')->references('id')->on('cash_shifts');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `sales` ADD CONSTRAINT `sales_chk_1` CHECK (((`subtotal` >= 0) and (`discount` >= 0) and (`tax` >= 0)))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('sales');
    }
};
