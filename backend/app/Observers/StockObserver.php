<?php

namespace App\Observers;

use App\Models\Product;
use App\Models\User;
use App\Notifications\LowStockNotification;
use Illuminate\Support\Facades\Notification;

/**
 * Patrón Observer (README §8.3): cuando el stock de un producto cruza su
 * mínimo, avisa a quienes hacen pedidos a proveedores (permiso purchasing.orders).
 * Solo avisa al cruzar el límite, no en cada venta posterior.
 */
class StockObserver
{
    public function updated(Product $product): void
    {
        if (! $product->wasChanged('stock') || ! $product->is_active || $product->min_stock <= 0) {
            return;
        }

        $before = (int) $product->getOriginal('stock');
        $crossedMinimum = $before > $product->min_stock && $product->stock <= $product->min_stock;

        if (! $crossedMinimum) {
            return;
        }

        $recipients = User::query()
            ->where('is_active', true)
            ->whereHas('role.permissions', fn ($q) => $q->where('code', 'purchasing.orders'))
            ->get();

        Notification::send($recipients, new LowStockNotification($product));
    }
}
