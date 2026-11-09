<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Tabla original (español): users
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('role_id');
            $table->unsignedBigInteger('cash_register_id')->nullable();
            $table->string('name', 150);
            $table->string('username', 40);
            $table->string('email', 150);
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password', 255);
            $table->string('phone', 10)->nullable();
            $table->string('specialty', 100)->nullable();
            $table->enum('shift', ['morning', 'evening', 'full_day'])->nullable();
            $table->time('start_time')->nullable();
            $table->time('end_time')->nullable();
            $table->decimal('max_discount_pct', 5, 2)->default(0.00);
            $table->string('authorization_code', 255)->nullable();
            $table->boolean('must_change_password')->default(true);
            $table->dateTime('password_reset_requested_at')->nullable();
            $table->boolean('chat_available')->default(true);
            $table->dateTime('unavailable_until')->nullable();
            $table->string('unavailable_message', 255)->nullable();
            $table->unsignedTinyInteger('failed_attempts')->default(0);
            $table->dateTime('locked_until')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_login_at')->nullable();
            $table->string('remember_token', 100)->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->index(['role_id', 'is_active'], 'users_role_id_is_active_index');
            $table->unique(['email'], 'users_email_unique');
            $table->unique(['username'], 'users_username_unique');
            $table->foreign('cash_register_id', 'users_cash_register_id_foreign')->references('id')->on('cash_registers');
            $table->foreign('role_id', 'users_role_id_foreign')->references('id')->on('roles');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `users` ADD CONSTRAINT `users_chk_1` CHECK ((`max_discount_pct` between 0 and 100))
            SQL);
        DB::statement(<<<'SQL'
            ALTER TABLE `users` ADD CONSTRAINT `users_chk_2` CHECK (((`phone` is null) or regexp_like(`phone`,'^[0-9]{10}$')))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
