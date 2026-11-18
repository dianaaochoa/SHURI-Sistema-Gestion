<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Acceso de un empleado (AD7): usuario y contraseña temporal que asigna el
 * administrador al darlo de alta o al reiniciar su contraseña. Al entrar,
 * el sistema le pide crear la suya (A.5). El contenido nunca se guarda en sent_emails.
 */
class StaffAccessMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $name,
        public readonly string $username,
        public readonly string $temporaryPassword,
        public readonly string $roleName,
        public readonly bool $isNewAccount,
        public readonly string $loginUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->isNewAccount ? 'Tu acceso a SHURI' : 'Tu nueva contraseña temporal de SHURI');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.staff-access');
    }
}
