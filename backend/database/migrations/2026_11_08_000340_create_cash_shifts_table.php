<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_shifts', function (Blueprint $table) {
            $table->id();
            $table->string('folio', 20)->nullable();
            $table->unsignedBigInteger('cash_register_id');
            $table->unsignedBigInteger('user_id');
            $table->enum('shift', ['morning', 'evening', 'full_day'])->default('morning');
            $table->dateTime('opened_at');
            $table->decimal('opening_amount', 10, 2)->default(0.00);
            $table->dateTime('closed_at')->nullable();
            $table->unsignedBigInteger('closed_by')->nullable();
            $table->decimal('expected_cash', 10, 2)->nullable();
            $table->decimal('counted_cash', 10, 2)->nullable();
            $table->decimal('difference', 10, 2)->storedAs('(`counted_cash` - `expected_cash`)');
            $table->decimal('card_total', 10, 2)->nullable();
            $table->decimal('transfer_total', 10, 2)->nullable();
            $table->decimal('cash_left', 10, 2)->nullable();
            $table->decimal('cash_handed_over', 10, 2)->nullable();
            $table->unsignedBigInteger('received_by')->nullable();
            $table->string('closing_notes', 255)->nullable();
            $table->enum('status', ['open', 'closed', 'reviewed'])->default('open');
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->dateTime('reviewed_at')->nullable();
            $table->string('review_comment', 255)->nullable();
            $table->unsignedBigInteger('open_cash_register_id')->storedAs('if((`status` = \'open\'),`cash_register_id`,NULL)');
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->index(['user_id', 'opened_at'], 'cash_shifts_user_id_opened_at_index');
            $table->unique(['folio'], 'cash_shifts_folio_unique');
            $table->unique(['open_cash_register_id'], 'cash_shifts_open_cash_register_id_unique');
            $table->foreign('cash_register_id', 'cash_shifts_cash_register_id_foreign')->references('id')->on('cash_registers');
            $table->foreign('closed_by', 'cash_shifts_closed_by_foreign')->references('id')->on('users');
            $table->foreign('received_by', 'cash_shifts_received_by_foreign')->references('id')->on('users');
            $table->foreign('reviewed_by', 'cash_shifts_reviewed_by_foreign')->references('id')->on('users');
            $table->foreign('user_id', 'cash_shifts_user_id_foreign')->references('id')->on('users');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `cash_shifts` ADD CONSTRAINT `cash_shifts_chk_1` CHECK ((`opening_amount` >= 0))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_shifts');
    }
};
