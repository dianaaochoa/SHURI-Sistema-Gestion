<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_movements', function (Blueprint $table) {
            $table->id();
            $table->string('folio', 20)->nullable();
            $table->unsignedBigInteger('cash_shift_id');
            $table->unsignedBigInteger('user_id');
            $table->enum('type', ['cash_out', 'cash_in']);
            $table->decimal('amount', 10, 2);
            $table->string('reason', 255);
            $table->decimal('cash_before', 10, 2)->nullable();
            $table->decimal('cash_after', 10, 2)->nullable();
            $table->unsignedBigInteger('received_by')->nullable();
            $table->unsignedBigInteger('authorized_by')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['cash_shift_id'], 'cash_movements_cash_shift_id_index');
            $table->unique(['folio'], 'cash_movements_folio_unique');
            $table->foreign('authorized_by', 'cash_movements_authorized_by_foreign')->references('id')->on('users');
            $table->foreign('received_by', 'cash_movements_received_by_foreign')->references('id')->on('users');
            $table->foreign('cash_shift_id', 'cash_movements_cash_shift_id_foreign')->references('id')->on('cash_shifts');
            $table->foreign('user_id', 'cash_movements_user_id_foreign')->references('id')->on('users');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `cash_movements` ADD CONSTRAINT `cash_movements_chk_1` CHECK ((`amount` > 0))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_movements');
    }
};
