<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('security_question', 40)->nullable()->after('two_factor_enabled');
            $table->string('security_answer_hash', 255)->nullable()->after('security_question');
        });

        Schema::table('customers', function (Blueprint $table) {
            $table->string('security_question', 40)->nullable()->after('must_change_password');
            $table->string('security_answer_hash', 255)->nullable()->after('security_question');
        });

        Schema::table('password_reset_tokens', function (Blueprint $table) {
            $table->unsignedTinyInteger('question_attempts')->default(0)->after('token');
        });

        Schema::table('customer_password_reset_tokens', function (Blueprint $table) {
            $table->unsignedTinyInteger('question_attempts')->default(0)->after('token_hash');
        });
    }

    public function down(): void
    {
        Schema::table('customer_password_reset_tokens', fn (Blueprint $table) => $table->dropColumn('question_attempts'));
        Schema::table('password_reset_tokens', fn (Blueprint $table) => $table->dropColumn('question_attempts'));
        Schema::table('customers', fn (Blueprint $table) => $table->dropColumn(['security_question', 'security_answer_hash']));
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn(['security_question', 'security_answer_hash']));
    }
};
