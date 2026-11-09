<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Tabla original (español): devoluciones_refaccion
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('part_returns', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('order_part_id');
            $table->unsignedBigInteger('technician_id');
            $table->integer('quantity')->default(1);
            $table->string('reason', 255);
            $table->enum('status', ['pending', 'received', 'rejected'])->default('pending');
            $table->enum('condition', ['new', 'open', 'damaged'])->nullable();
            $table->boolean('returns_to_stock')->default(true);
            $table->unsignedBigInteger('received_by')->nullable();
            $table->dateTime('received_at')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->index(['status'], 'part_returns_status_index');
            $table->foreign('order_part_id', 'part_returns_order_part_id_foreign')->references('id')->on('order_parts');
            $table->foreign('received_by', 'part_returns_received_by_foreign')->references('id')->on('users');
            $table->foreign('technician_id', 'part_returns_technician_id_foreign')->references('id')->on('users');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `part_returns` ADD CONSTRAINT `part_returns_chk_1` CHECK ((`quantity` > 0))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('part_returns');
    }
};
