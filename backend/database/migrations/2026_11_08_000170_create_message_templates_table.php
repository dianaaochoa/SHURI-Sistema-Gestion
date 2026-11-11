<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('message_templates', function (Blueprint $table) {
            $table->id();
            $table->string('code', 40);
            $table->string('name', 80);
            $table->string('sent_when', 150);
            $table->boolean('via_portal')->default(true);
            $table->boolean('via_email')->default(false);
            $table->boolean('is_active')->default(true);
            $table->string('email_subject', 200)->nullable();
            $table->text('body');
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->unique(['code'], 'message_templates_code_unique');
            $table->foreign('updated_by', 'message_templates_updated_by_foreign')->references('id')->on('users');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('message_templates');
    }
};
