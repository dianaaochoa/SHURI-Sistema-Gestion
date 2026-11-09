<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Tabla original (español): equipos
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('devices', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('customer_id');
            $table->string('type', 40);
            $table->string('brand', 60);
            $table->string('model', 80)->nullable();
            $table->string('serial_number', 80)->nullable();
            $table->string('color', 40)->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->index(['customer_id'], 'devices_customer_id_index');
            $table->index(['serial_number'], 'devices_serial_number_index');
            $table->foreign('customer_id', 'devices_customer_id_foreign')->references('id')->on('customers');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('devices');
    }
};
