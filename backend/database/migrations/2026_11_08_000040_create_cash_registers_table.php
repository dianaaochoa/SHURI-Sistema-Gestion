<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_registers', function (Blueprint $table) {
            $table->id();
            $table->string('name', 40);
            $table->string('location', 80)->nullable();
            $table->decimal('default_opening_amount', 10, 2)->default(0.00);
            $table->string('shifts', 60)->nullable();
            $table->string('terminal', 60)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->unique(['name'], 'cash_registers_name_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_registers');
    }
};
