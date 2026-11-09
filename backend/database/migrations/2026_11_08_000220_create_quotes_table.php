<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Tabla original (español): presupuestos
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('quotes', function (Blueprint $table) {
            $table->id();
            $table->string('folio', 20);
            $table->unsignedBigInteger('service_order_id')->nullable();
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->enum('type', ['initial', 'additional', 'counter'])->default('initial');
            $table->string('device_description', 150)->nullable();
            $table->unsignedBigInteger('technician_id')->nullable();
            $table->text('diagnosis')->nullable();
            $table->string('failure_cause', 120)->nullable();
            $table->unsignedBigInteger('labor_level_id')->nullable();
            $table->unsignedSmallInteger('estimated_minutes')->nullable();
            $table->boolean('is_urgent')->default(false);
            $table->text('technician_notes')->nullable();
            $table->text('customer_note')->nullable();
            $table->string('return_reason', 255)->nullable();
            $table->date('estimated_delivery_date')->nullable();
            $table->decimal('labor_amount', 10, 2)->default(0.00);
            $table->decimal('parts_amount', 10, 2)->default(0.00);
            $table->decimal('discount', 10, 2)->default(0.00);
            $table->decimal('total', 10, 2)->storedAs('((`labor_amount` + `parts_amount`) - `discount`)');
            $table->unsignedSmallInteger('warranty_days')->default(30);
            $table->date('valid_until')->nullable();
            $table->enum('status', ['to_quote', 'returned_to_technician', 'pending', 'approved', 'rejected', 'expired', 'cancelled'])->default('to_quote');
            $table->unsignedBigInteger('quoted_by')->nullable();
            $table->dateTime('quoted_at')->nullable();
            $table->dateTime('sent_at')->nullable();
            $table->enum('response_channel', ['portal', 'counter', 'phone'])->nullable();
            $table->unsignedBigInteger('answered_by')->nullable();
            $table->string('customer_comment', 255)->nullable();
            $table->dateTime('answered_at')->nullable();
            $table->string('response_ip', 45)->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->index(['status', 'created_at'], 'quotes_status_created_at_index');
            $table->index(['service_order_id', 'status'], 'quotes_service_order_id_status_index');
            $table->unique(['folio'], 'quotes_folio_unique');
            $table->foreign('customer_id', 'quotes_customer_id_foreign')->references('id')->on('customers');
            $table->foreign('quoted_by', 'quotes_quoted_by_foreign')->references('id')->on('users');
            $table->foreign('created_by', 'quotes_created_by_foreign')->references('id')->on('users');
            $table->foreign('labor_level_id', 'quotes_labor_level_id_foreign')->references('id')->on('labor_levels');
            $table->foreign('service_order_id', 'quotes_service_order_id_foreign')->references('id')->on('service_orders');
            $table->foreign('answered_by', 'quotes_answered_by_foreign')->references('id')->on('users');
            $table->foreign('technician_id', 'quotes_technician_id_foreign')->references('id')->on('users');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `quotes` ADD CONSTRAINT `quotes_chk_1` CHECK (((`labor_amount` >= 0) and (`parts_amount` >= 0) and (`discount` >= 0)))
            SQL);
        DB::statement(<<<'SQL'
            ALTER TABLE `quotes` ADD CONSTRAINT `quotes_chk_2` CHECK (((`service_order_id` is not null) or (`type` = 'counter')))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('quotes');
    }
};
