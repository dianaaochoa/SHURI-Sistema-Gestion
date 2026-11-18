<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('warranties', function (Blueprint $table) {
            $table->id();
            $table->string('folio', 20);
            $table->unsignedBigInteger('service_order_id');
            $table->unsignedBigInteger('customer_id');
            $table->enum('request_channel', ['portal', 'counter']);
            $table->text('customer_reason');
            $table->enum('status', ['requested', 'received', 'in_review', 'awaiting_ruling', 'approved', 'rejected', 'in_repair', 'finished', 'delivered', 'cancelled'])->default('requested');
            $table->unsignedBigInteger('received_by')->nullable();
            $table->dateTime('received_at')->nullable();
            $table->unsignedBigInteger('technician_id')->nullable();
            $table->text('technician_review')->nullable();
            $table->enum('ruling', ['covered', 'not_covered', 'covered_with_cost'])->nullable();
            $table->unsignedBigInteger('ruled_by')->nullable();
            $table->dateTime('ruled_at')->nullable();
            $table->string('ruling_reason', 255)->nullable();
            $table->decimal('extra_cost', 10, 2)->default(0.00);
            $table->boolean('extra_cost_accepted')->nullable();
            $table->dateTime('answered_at')->nullable();
            $table->dateTime('finished_at')->nullable();
            $table->unsignedBigInteger('delivered_by')->nullable();
            $table->dateTime('delivered_at')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->index(['status'], 'warranties_status_index');
            $table->index(['service_order_id'], 'warranties_service_order_id_index');
            $table->unique(['folio'], 'warranties_folio_unique');
            $table->foreign('customer_id', 'warranties_customer_id_foreign')->references('id')->on('customers');
            $table->foreign('ruled_by', 'warranties_ruled_by_foreign')->references('id')->on('users');
            $table->foreign('delivered_by', 'warranties_delivered_by_foreign')->references('id')->on('users');
            $table->foreign('service_order_id', 'warranties_service_order_id_foreign')->references('id')->on('service_orders');
            $table->foreign('received_by', 'warranties_received_by_foreign')->references('id')->on('users');
            $table->foreign('technician_id', 'warranties_technician_id_foreign')->references('id')->on('users');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `warranties` ADD CONSTRAINT `warranties_chk_1` CHECK ((`extra_cost` >= 0))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('warranties');
    }
};
