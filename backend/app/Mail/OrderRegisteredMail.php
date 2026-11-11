<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * "Equipo recibido" (RF-17, P6): folio of the new order and, on the
 * customer's first visit, their portal access with the temporary password (RF-06).
 */
class OrderRegisteredMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $customerName,
        public readonly string $folio,
        public readonly string $device,
        public readonly string $email,
        public readonly ?string $temporaryPassword,
        public readonly string $portalUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "Recibimos tu equipo · Folio {$this->folio}");
    }

    public function content(): Content
    {
        return new Content(view: 'emails.order-registered');
    }
}
