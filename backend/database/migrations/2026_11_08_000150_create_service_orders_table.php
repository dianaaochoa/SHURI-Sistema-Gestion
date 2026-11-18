<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_orders', function (Blueprint $table) {
            $table->id();
            $table->string('folio', 20);
            $table->unsignedBigInteger('customer_id');
            $table->unsignedBigInteger('device_id');
            $table->unsignedBigInteger('status_id')->default(1);
            $table->enum('priority', ['low', 'normal', 'high', 'urgent'])->default('normal');
            $table->unsignedBigInteger('cash_register_id')->nullable();
            $table->text('reported_issue');
            $table->string('received_accessories', 255)->nullable();
            $table->json('intake_checklist')->nullable();
            $table->string('physical_condition', 255)->nullable();
            $table->string('device_pin', 512)->nullable();
            $table->text('diagnosis')->nullable();
            $table->string('failure_cause', 120)->nullable();
            $table->unsignedBigInteger('labor_level_id')->nullable();
            $table->unsignedSmallInteger('estimated_minutes')->nullable();
            $table->dateTime('diagnosis_due_at')->nullable();
            $table->boolean('is_paused')->default(false);
            $table->string('pause_reason', 255)->nullable();
            $table->string('no_repair_reason', 255)->nullable();
            $table->boolean('charge_inspection')->default(true);
            $table->decimal('estimated_cost', 10, 2)->default(0.00);
            $table->decimal('deposit', 10, 2)->default(0.00);
            $table->decimal('labor_cost', 10, 2)->default(0.00);
            $table->decimal('parts_cost', 10, 2)->default(0.00);
            $table->decimal('total', 10, 2)->storedAs('(`labor_cost` + `parts_cost`)');
            $table->boolean('is_paid')->default(false);
            $table->unsignedBigInteger('received_by');
            $table->unsignedBigInteger('assigned_by')->nullable();
            $table->unsignedBigInteger('technician_id')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->enum('location', ['workshop', 'counter', 'storage'])->default('workshop');
            $table->dateTime('sent_to_storage_at')->nullable();
            $table->boolean('storage_fee_waived')->default(false);
            $table->unsignedBigInteger('waived_by')->nullable();
            $table->string('waiver_reason', 255)->nullable();
            $table->decimal('storage_fee', 10, 2)->default(0.00);
            $table->unsignedSmallInteger('warranty_days')->default(30);
            $table->date('warranty_until')->nullable();
            $table->unsignedBigInteger('delivered_by')->nullable();
            $table->string('picked_up_by_name', 150)->nullable();
            $table->enum('picked_up_id_type', ['ine', 'passport', 'drivers_license', 'other'])->nullable();
            $table->string('picked_up_id_number', 60)->nullable();
            $table->string('picked_up_relationship', 40)->nullable();
            $table->boolean('has_power_of_attorney')->default(false);
            $table->boolean('has_owner_id_copy')->default(false);
            $table->json('delivery_checklist')->nullable();
            $table->unsignedTinyInteger('rating')->nullable();
            $table->json('rating_tags')->nullable();
            $table->string('rating_comment', 500)->nullable();
            $table->dateTime('rated_at')->nullable();
            $table->date('promised_date')->nullable();
            $table->dateTime('assigned_at')->nullable();
            $table->dateTime('quoting_started_at')->nullable();
            $table->dateTime('approved_at')->nullable();
            $table->dateTime('ready_at')->nullable();
            $table->dateTime('delivered_at')->nullable();
            $table->dateTime('abandoned_at')->nullable();
            $table->dateTime('disposed_at')->nullable();
            $table->unsignedBigInteger('disposed_by')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->index(['customer_id'], 'service_orders_customer_id_index');
            $table->index(['created_at'], 'service_orders_created_at_index');
            $table->index(['device_id'], 'service_orders_device_id_index');
            $table->index(['status_id'], 'service_orders_status_id_index');
            $table->index(['ready_at'], 'service_orders_ready_at_index');
            $table->index(['technician_id', 'status_id'], 'service_orders_technician_id_status_id_index');
            $table->unique(['folio'], 'service_orders_folio_unique');
            $table->foreign('updated_by', 'service_orders_updated_by_foreign')->references('id')->on('users');
            $table->foreign('assigned_by', 'service_orders_assigned_by_foreign')->references('id')->on('users');
            $table->foreign('cash_register_id', 'service_orders_cash_register_id_foreign')->references('id')->on('cash_registers');
            $table->foreign('customer_id', 'service_orders_customer_id_foreign')->references('id')->on('customers');
            $table->foreign('waived_by', 'service_orders_waived_by_foreign')->references('id')->on('users');
            $table->foreign('disposed_by', 'service_orders_disposed_by_foreign')->references('id')->on('users');
            $table->foreign('delivered_by', 'service_orders_delivered_by_foreign')->references('id')->on('users');
            $table->foreign('device_id', 'service_orders_device_id_foreign')->references('id')->on('devices');
            $table->foreign('status_id', 'service_orders_status_id_foreign')->references('id')->on('order_statuses');
            $table->foreign('labor_level_id', 'service_orders_labor_level_id_foreign')->references('id')->on('labor_levels');
            $table->foreign('received_by', 'service_orders_received_by_foreign')->references('id')->on('users');
            $table->foreign('technician_id', 'service_orders_technician_id_foreign')->references('id')->on('users');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `service_orders` ADD CONSTRAINT `service_orders_chk_1` CHECK (((`deposit` >= 0) and (`labor_cost` >= 0) and (`parts_cost` >= 0) and (`estimated_cost` >= 0) and (`storage_fee` >= 0)))
            SQL);
        DB::statement(<<<'SQL'
            ALTER TABLE `service_orders` ADD CONSTRAINT `service_orders_chk_2` CHECK (((`rating` is null) or (`rating` between 1 and 5)))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('service_orders');
    }
};
