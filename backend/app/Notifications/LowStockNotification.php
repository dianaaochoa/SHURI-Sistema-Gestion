<?php

namespace App\Notifications;

use App\Models\Product;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Aviso interno (campanita) cuando un producto llega a su stock mínimo.
 * Se guarda en la tabla `notifications`.
 */
class LowStockNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly Product $product) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        return [
            'kind' => 'low_stock',
            'product_id' => $this->product->id,
            'sku' => $this->product->sku,
            'name' => $this->product->name,
            'stock' => $this->product->stock,
            'min_stock' => $this->product->min_stock,
            'message' => $this->product->stock === 0
                ? "Se agotó «{$this->product->name}»."
                : "Quedan {$this->product->stock} de «{$this->product->name}» (mínimo {$this->product->min_stock}).",
        ];
    }
}
