<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('messages', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('conversation_id');
            $table->enum('sender', ['customer', 'staff', 'system']);
            $table->unsignedBigInteger('user_id')->nullable();
            $table->enum('type', ['text', 'photo', 'status', 'notice'])->default('text');
            $table->text('body');
            $table->string('attachment_path', 255)->nullable();
            $table->json('data')->nullable();
            $table->unsignedBigInteger('message_template_id')->nullable();
            $table->dateTime('read_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['conversation_id', 'created_at'], 'messages_conversation_id_created_at_index');
            $table->foreign('conversation_id', 'messages_conversation_id_foreign')->references('id')->on('conversations');
            $table->foreign('message_template_id', 'messages_message_template_id_foreign')->references('id')->on('message_templates');
            $table->foreign('user_id', 'messages_user_id_foreign')->references('id')->on('users');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE `messages` ADD CONSTRAINT `messages_chk_1` CHECK (((`sender` <> 'staff') or (`user_id` is not null)))
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('messages');
    }
};
