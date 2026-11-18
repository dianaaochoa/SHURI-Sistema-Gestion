<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('permissions', function (Blueprint $table) {
            $table->id();
            $table->string('code', 60);
            $table->string('name', 120);
            $table->string('module', 40);
            $table->unique(['code'], 'permissions_code_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('permissions');
    }
};
