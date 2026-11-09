<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Verification code for staff login (MFA). Sent immediately, not queued:
 * the person is waiting on the login screen.
 */
class TwoFactorCodeMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $name,
        public readonly string $code,
        public readonly int $minutes,
    ) {}

    public function subjectLine(): string
    {
        return 'Tu código de acceso a SHURI';
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->subjectLine());
    }

    public function content(): Content
    {
        return new Content(view: 'emails.two-factor-code');
    }
}
