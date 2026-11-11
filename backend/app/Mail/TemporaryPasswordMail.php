<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Contraseña temporal después de una recuperación correcta (A.3).
 * Se envía de inmediato: la persona está esperando en la pantalla.
 * El contenido nunca se guarda en sent_emails.
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
