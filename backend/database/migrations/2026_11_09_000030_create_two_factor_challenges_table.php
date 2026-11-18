<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('two_factor_challenges', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->char('challenge_hash', 64);
            $table->string('code_hash', 255);
            $table->string('device_name', 100)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->dateTime('expires_at');
            $table->dateTime('last_sent_at');
            $table->dateTime('consumed_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['challenge_hash'], 'two_factor_challenges_challenge_hash_unique');
            $table->index(['user_id', 'expires_at'], 'two_factor_challenges_user_id_expires_at_index');
            $table->foreign('user_id', 'two_factor_challenges_user_id_foreign')->references('id')->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('two_factor_challenges');
    }
};
