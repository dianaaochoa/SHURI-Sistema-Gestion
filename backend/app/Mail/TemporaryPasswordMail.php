<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Temporary password after a successful recovery (A.3).
 * Sent immediately: the person is waiting on the screen.
 * The body is never stored in sent_emails.
 */
class TemporaryPasswordMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $name,
        public readonly string $login,
        public readonly string $temporaryPassword,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Tu contraseña temporal de SHURI');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.temporary-password');
    }
}
