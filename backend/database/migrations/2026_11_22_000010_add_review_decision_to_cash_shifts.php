<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * AD3.2 Revisión de un corte con diferencia: qué decidió el administrador.
 * deduct = se descuenta a la cajera · absorb = lo absorbe el negocio ·
 * investigate = queda en investigación (el corte sigue pendiente de revisión).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cash_shifts', function (Blueprint $table) {
            $table->enum('review_decision', ['deduct', 'absorb', 'investigate'])->nullable()->after('reviewed_at');
        });
    }

    public function down(): void
    {
        Schema::table('cash_shifts', function (Blueprint $table) {
            $table->dropColumn('review_decision');
        });
    }
};
