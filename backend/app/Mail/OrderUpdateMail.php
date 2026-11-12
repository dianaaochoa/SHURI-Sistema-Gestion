<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Aviso al cliente cuando cambia algo importante de su orden (RF-17, P6):
 * presupuesto por aprobar, equipo listo para recoger, etc.
 * Una sola plantilla con título, mensaje, renglones de detalle y botón al portal.
 */
class OrderUpdateMail extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * @param  array<string, string>  $details  etiqueta => valor (p. ej. "Total" => "$1,300.00")
     */
    public function __construct(
        public readonly string $subjectLine,
        public readonly string $customerName,
        public readonly string $folio,
        public readonly string $title,
        public readonly string $body,
        public readonly array $details,
        public readonly string $buttonText,
        public readonly string $portalUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->subjectLine);
    }

    public function content(): Content
    {
        return new Content(view: 'emails.order-update');
    }
}
