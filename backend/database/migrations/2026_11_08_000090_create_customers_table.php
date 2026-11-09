<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Tabla original (español): clientes
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->string('last_name', 100)->nullable();
            $table->string('phone', 10);
            $table->string('email', 150);
            $table->string('address', 200)->nullable();
            $table->string('neighborhood', 100)->nullable();
            $table->string('city', 100)->nullable();
            $table->string('state', 60)->nullable();
            $table->char('postal_code', 5)->nullable();
            $table->string('notes', 255)->nullable();
            $table->string('password', 255)->nullable();
            $table->boolean('must_change_password')->default(true);
            $table->dateTime('temporary_password_expires_at')->nullable();
            $table->string('temporary_password_encrypted', 512)->nullable();
            $table->dateTime('password_changed_at')->nullable();
            $table->dateTime('email_verified_at')->nullable();
            $table->unsignedTinyInteger('failed_attempts')->default(0);
            $table->dateTime('locked_until')->nullable();
            $table->dateTime('last_login_at')->nullable();
            $table->dateTime('privacy_accepted_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->string('remember_token', 100)->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->index(['name', 'last_name'], 'customers_name_last_name_index');
            $table->unique(['email'], 'customers_email_unique');
            $table->unique(['phone'], 'customers_phone_unique');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `customers` ADD CONSTRAINT `customers_chk_1` CHECK (regexp_like(`phone`,'^[0-9]{10}$'))
            SQL);
        DB::statement(<<<'SQL'
            ALTER TABLE `customers` ADD CONSTRAINT `customers_chk_2` CHECK (regexp_like(`email`,'^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'))
            SQL);
        DB::statement(<<<'SQL'
            ALTER TABLE `customers` ADD CONSTRAINT `customers_chk_3` CHECK (((`postal_code` is null) or regexp_like(`postal_code`,'^[0-9]{5}$')))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('customers');
    }
};
