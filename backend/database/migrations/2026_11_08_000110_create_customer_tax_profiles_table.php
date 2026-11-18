<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_tax_profiles', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('customer_id');
            $table->string('rfc', 13);
            $table->string('business_name', 200);
            $table->char('tax_regime', 3);
            $table->char('postal_code', 5);
            $table->string('cfdi_use', 4)->default('G03');
            $table->string('invoice_email', 150)->nullable();
            $table->boolean('is_default')->default(true);
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->index(['customer_id'], 'customer_tax_profiles_customer_id_index');
            $table->index(['rfc'], 'customer_tax_profiles_rfc_index');
            $table->foreign('customer_id', 'customer_tax_profiles_customer_id_foreign')->references('id')->on('customers')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_tax_profiles');
    }
};
