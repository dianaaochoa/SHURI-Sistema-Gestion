<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const EMAIL_TYPES = "'temporary_password','password_recovery','password_changed','order_registered','quote_pending','info_request','additional_charge','ready_for_pickup','storage_reminder','storage_fee_notice','abandonment_notice','warranty','warranty_ruling','chat_reply','invoice','test'";

    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('two_factor_enabled')->default(true)->after('must_change_password');
        });

        DB::statement('ALTER TABLE `sent_emails` MODIFY `type` ENUM('.self::EMAIL_TYPES.",'two_factor_code') NOT NULL");
    }

    public function down(): void
    {
        DB::table('sent_emails')->where('type', 'two_factor_code')->delete();
        DB::statement('ALTER TABLE `sent_emails` MODIFY `type` ENUM('.self::EMAIL_TYPES.') NOT NULL');

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('two_factor_enabled');
        });
    }
};
