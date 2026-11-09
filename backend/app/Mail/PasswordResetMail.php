<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Link to reset the password (A.3 staff / portal "¿Olvidaste tu contraseña?").
 */
class PasswordResetMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $name,
        public readonly string $url,
        public readonly int $minutes,
        public readonly bool $asksQuestion,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Recupera tu contraseña de SHURI');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.password-reset');
    }
}
