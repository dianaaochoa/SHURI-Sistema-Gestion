<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Tabla original (español): pagos
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('sale_id');
            $table->unsignedBigInteger('cash_shift_id')->nullable();
            $table->enum('method', ['cash', 'card', 'transfer', 'credit_note']);
            $table->decimal('amount', 10, 2);
            $table->decimal('amount_received', 10, 2)->nullable();
            $table->decimal('change_given', 10, 2)->nullable();
            $table->string('reference', 80)->nullable();
            $table->char('card_last4', 4)->nullable();
            $table->unsignedBigInteger('credit_note_id')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->index(['cash_shift_id', 'method'], 'payments_cash_shift_id_method_index');
            $table->index(['sale_id'], 'payments_sale_id_index');
            $table->foreign('credit_note_id', 'payments_credit_note_id_foreign')->references('id')->on('credit_notes');
            $table->foreign('cash_shift_id', 'payments_cash_shift_id_foreign')->references('id')->on('cash_shifts');
            $table->foreign('sale_id', 'payments_sale_id_foreign')->references('id')->on('sales');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `payments` ADD CONSTRAINT `payments_chk_1` CHECK ((`amount` > 0))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
