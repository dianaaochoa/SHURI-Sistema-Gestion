<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Tabla original (español): conversaciones
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('conversations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('customer_id');
            $table->unsignedBigInteger('service_order_id')->nullable();
            $table->enum('status', ['open', 'closed'])->default('open');
            $table->unsignedBigInteger('handled_by')->nullable();
            $table->boolean('awaiting_reply')->default(false);
            $table->dateTime('last_message_at')->nullable();
            $table->dateTime('closed_at')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->index(['status', 'awaiting_reply', 'last_message_at'], 'conversations_status_awaiting_reply_last_message_at_index');
            $table->index(['customer_id'], 'conversations_customer_id_index');
            $table->foreign('handled_by', 'conversations_handled_by_foreign')->references('id')->on('users');
            $table->foreign('customer_id', 'conversations_customer_id_foreign')->references('id')->on('customers');
            $table->foreign('service_order_id', 'conversations_service_order_id_foreign')->references('id')->on('service_orders');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('conversations');
    }
};
