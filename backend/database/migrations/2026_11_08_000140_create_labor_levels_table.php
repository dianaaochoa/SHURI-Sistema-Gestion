<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('labor_levels', function (Blueprint $table) {
            $table->id();
            $table->string('name', 40);
            $table->string('typical_time', 40)->nullable();
            $table->string('examples', 200)->nullable();
            $table->decimal('price', 10, 2)->default(0.00);
            $table->boolean('is_inspection')->default(false);
            $table->unsignedTinyInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->unique(['name'], 'labor_levels_name_unique');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `labor_levels` ADD CONSTRAINT `labor_levels_chk_1` CHECK ((`price` >= 0))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('labor_levels');
    }
};
