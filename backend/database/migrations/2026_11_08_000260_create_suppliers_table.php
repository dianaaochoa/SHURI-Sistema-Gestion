<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Tabla original (español): proveedores
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('suppliers', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->string('contact_name', 120)->nullable();
            $table->string('phone', 15)->nullable();
            $table->string('email', 150)->nullable();
            $table->string('rfc', 13)->nullable();
            $table->unsignedSmallInteger('credit_days')->default(0);
            $table->string('notes', 255)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->unique(['name'], 'suppliers_name_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('suppliers');
    }
};
