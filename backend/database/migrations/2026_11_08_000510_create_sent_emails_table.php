<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sent_emails', function (Blueprint $table) {
            $table->id();
            $table->string('recipient', 150);
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->unsignedBigInteger('service_order_id')->nullable();
            $table->unsignedBigInteger('message_template_id')->nullable();
            $table->enum('type', ['temporary_password', 'password_recovery', 'password_changed', 'order_registered', 'quote_pending', 'info_request', 'additional_charge', 'ready_for_pickup', 'storage_reminder', 'storage_fee_notice', 'abandonment_notice', 'warranty', 'warranty_ruling', 'chat_reply', 'invoice', 'test']);
            $table->string('subject', 200);
            $table->enum('status', ['pending', 'sent', 'failed'])->default('pending');
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->string('error', 500)->nullable();
            $table->dateTime('sent_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['customer_id', 'type'], 'sent_emails_customer_id_type_index');
            $table->index(['status', 'created_at'], 'sent_emails_status_created_at_index');
            $table->index(['service_order_id'], 'sent_emails_service_order_id_index');
            $table->foreign('customer_id', 'sent_emails_customer_id_foreign')->references('id')->on('customers');
            $table->foreign('service_order_id', 'sent_emails_service_order_id_foreign')->references('id')->on('service_orders');
            $table->foreign('message_template_id', 'sent_emails_message_template_id_foreign')->references('id')->on('message_templates');
            $table->foreign('user_id', 'sent_emails_user_id_foreign')->references('id')->on('users');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sent_emails');
    }
};
