<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Tabla original (español): devoluciones_venta
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sale_returns', function (Blueprint $table) {
            $table->id();
            $table->string('folio', 20);
            $table->unsignedBigInteger('sale_id');
            $table->unsignedBigInteger('cash_shift_id')->nullable();
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('authorized_by')->nullable();
            $table->string('reason', 255);
            $table->decimal('total', 10, 2);
            $table->enum('refund_method', ['cash', 'card', 'transfer', 'credit_note']);
            $table->unsignedBigInteger('credit_note_id')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['sale_id'], 'sale_returns_sale_id_index');
            $table->unique(['folio'], 'sale_returns_folio_unique');
            $table->foreign('authorized_by', 'sale_returns_authorized_by_foreign')->references('id')->on('users');
            $table->foreign('credit_note_id', 'sale_returns_credit_note_id_foreign')->references('id')->on('credit_notes');
            $table->foreign('cash_shift_id', 'sale_returns_cash_shift_id_foreign')->references('id')->on('cash_shifts');
            $table->foreign('user_id', 'sale_returns_user_id_foreign')->references('id')->on('users');
            $table->foreign('sale_id', 'sale_returns_sale_id_foreign')->references('id')->on('sales');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `sale_returns` ADD CONSTRAINT `sale_returns_chk_1` CHECK ((`total` > 0))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('sale_returns');
    }
};
