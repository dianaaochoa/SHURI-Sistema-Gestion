<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\SentEmail;
use App\Models\User;
use Illuminate\Mail\Mailable;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Throwable;

/**
 * Sends an email and records it in `sent_emails` (RF-17: every email
 * sent is logged). Never stores the body, so passwords or codes are not saved.
 */
class MailService
{
    /**
     * @return bool true if the email was handed to the mail server
     */
    public function send(Mailable $mail, User|Customer $to, string $type): bool
    {
        $log = SentEmail::create([
            'recipient' => $to->email,
            'user_id' => $to instanceof User ? $to->id : null,
            'customer_id' => $to instanceof Customer ? $to->id : null,
            'type' => $type,
            'subject' => Str::limit((string) $mail->envelope()->subject, 195),
            'status' => 'pending',
            'attempts' => 1,
        ]);

        try {
            Mail::to($to->email)->send($mail);
            $log->update(['status' => 'sent', 'sent_at' => now()]);

            return true;
        } catch (Throwable $e) {
            report($e);
            $log->update(['status' => 'failed', 'error' => Str::limit($e->getMessage(), 490)]);

            return false;
        }
    }
}
