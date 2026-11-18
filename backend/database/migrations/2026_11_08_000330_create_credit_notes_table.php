<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('credit_notes', function (Blueprint $table) {
            $table->id();
            $table->string('folio', 20);
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->decimal('amount', 10, 2);
            $table->decimal('balance', 10, 2);
            $table->date('valid_until')->nullable();
            $table->enum('status', ['active', 'applied', 'expired', 'cancelled'])->default('active');
            $table->unsignedBigInteger('created_by');
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->unique(['folio'], 'credit_notes_folio_unique');
            $table->foreign('customer_id', 'credit_notes_customer_id_foreign')->references('id')->on('customers');
            $table->foreign('created_by', 'credit_notes_created_by_foreign')->references('id')->on('users');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `credit_notes` ADD CONSTRAINT `credit_notes_chk_1` CHECK (((`amount` > 0) and (`balance` between 0 and `amount`)))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('credit_notes');
    }
};
