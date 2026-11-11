<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('settings', function (Blueprint $table) {
            $table->string('key', 60);
            $table->text('value');
            $table->enum('type', ['text', 'integer', 'decimal', 'boolean', 'json'])->default('text');
            $table->string('group', 30)->default('negocio');
            $table->string('description', 255)->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->primary(['key']);
            $table->index(['group'], 'settings_group_index');
            $table->foreign('updated_by', 'settings_updated_by_foreign')->references('id')->on('users');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('settings');
    }
};
