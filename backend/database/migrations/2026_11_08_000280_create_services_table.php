<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('services', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('description', 255)->nullable();
            $table->string('device_type', 40)->nullable();
            $table->decimal('price', 10, 2)->default(0.00);
            $table->unsignedSmallInteger('estimated_minutes')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->unique(['name'], 'services_name_unique');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `services` ADD CONSTRAINT `services_chk_1` CHECK ((`price` >= 0))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('services');
    }
};
