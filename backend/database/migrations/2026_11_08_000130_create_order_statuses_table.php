<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Tabla original (español): estados_orden
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_statuses', function (Blueprint $table) {
            $table->unsignedBigInteger('id');
            $table->string('code', 40);
            $table->string('name', 60);
            $table->string('customer_message', 255);
            $table->char('color_hex', 7);
            $table->unsignedTinyInteger('sort_order');
            $table->unsignedTinyInteger('portal_step')->default(0);
            $table->boolean('is_final')->default(false);
            $table->boolean('allows_work')->default(true);
            $table->boolean('awaiting_pickup')->default(false);
            $table->primary(['id']);
            $table->unique(['code'], 'order_statuses_code_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_statuses');
    }
};
