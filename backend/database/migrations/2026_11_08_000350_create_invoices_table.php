<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Tabla original (español): facturas
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->string('series', 10)->default('A');
            $table->unsignedInteger('number');
            $table->char('sat_uuid', 36)->nullable();
            $table->enum('type', ['individual', 'global'])->default('individual');
            $table->char('period', 7)->nullable();
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->string('rfc', 13);
            $table->string('business_name', 200);
            $table->char('tax_regime', 3);
            $table->char('postal_code', 5);
            $table->string('cfdi_use', 4);
            $table->char('payment_form', 2);
            $table->char('payment_method', 3)->default('PUE');
            $table->decimal('subtotal', 10, 2);
            $table->decimal('tax', 10, 2);
            $table->decimal('total', 10, 2);
            $table->enum('status', ['pending', 'issued', 'cancelled', 'error'])->default('pending');
            $table->enum('origin', ['counter', 'portal', 'admin'])->default('counter');
            $table->string('xml_path', 255)->nullable();
            $table->string('pdf_path', 255)->nullable();
            $table->unsignedBigInteger('issued_by')->nullable();
            $table->dateTime('issued_at')->nullable();
            $table->unsignedBigInteger('cancelled_by')->nullable();
            $table->dateTime('cancelled_at')->nullable();
            $table->char('cancellation_reason', 2)->nullable();
            $table->unsignedBigInteger('replaced_by')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->index(['status', 'created_at'], 'invoices_status_created_at_index');
            $table->unique(['series', 'number'], 'invoices_series_number_unique');
            $table->unique(['sat_uuid'], 'invoices_sat_uuid_unique');
            $table->foreign('cancelled_by', 'invoices_cancelled_by_foreign')->references('id')->on('users');
            $table->foreign('customer_id', 'invoices_customer_id_foreign')->references('id')->on('customers');
            $table->foreign('issued_by', 'invoices_issued_by_foreign')->references('id')->on('users');
            $table->foreign('replaced_by', 'invoices_replaced_by_foreign')->references('id')->on('invoices');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invoices');
    }
};
