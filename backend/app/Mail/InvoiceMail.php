<?php

namespace App\Mail;

use Illuminate\Mail\Mailables\Attachment;

/**
 * Factura enviada al cliente (RF-16): el mismo diseño de los avisos, con el XML adjunto.
 */
class InvoiceMail extends OrderUpdateMail
{
    /** @param  array<string, string>  $details */
    public function __construct(
        string $subjectLine,
        string $customerName,
        string $folio,
        string $body,
        array $details,
        string $portalUrl,
        public readonly string $xml,
        public readonly string $fileName,
    ) {
        parent::__construct($subjectLine, $customerName, $folio, 'Tu factura está lista', $body, $details, 'Ver mis facturas', $portalUrl);
    }

    /** @return array<int, Attachment> */
    public function attachments(): array
    {
        return [Attachment::fromData(fn () => $this->xml, $this->fileName)->withMime('application/xml')];
    }
}
