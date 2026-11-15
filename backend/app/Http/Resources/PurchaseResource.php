<?php

namespace App\Http\Resources;

use App\Models\Purchase;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Compra con factura del proveedor (C7, AD5): lo que entró al stock y la cuenta por pagar.
 *
 * @mixin Purchase
 */
class PurchaseResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'folio' => $this->folio,
            'supplier' => $this->whenLoaded('supplier', fn () => ['id' => $this->supplier->id, 'name' => $this->supplier->name]),
            'purchase_order_folio' => $this->whenLoaded('purchaseOrder', fn () => $this->purchaseOrder?->folio),
            'supplier_invoice' => $this->supplier_invoice,
            'purchase_date' => $this->purchase_date?->toDateString(),
            'subtotal' => (float) $this->subtotal,
            'tax' => (float) $this->tax,
            'total' => (float) $this->total,
            'amount_paid' => (float) $this->amount_paid,
            'balance' => round((float) $this->total - (float) $this->amount_paid, 2),
            'payment_status' => $this->payment_status,
            'due_date' => $this->due_date?->toDateString(),
            'is_overdue' => $this->payment_status !== 'paid' && $this->due_date?->isPast(),
            'notes' => $this->notes,
            'items' => $this->whenLoaded('purchaseItems', fn () => $this->purchaseItems->map(fn ($item) => [
                'product_id' => $item->product_id,
                'product' => $item->product?->name,
                'quantity' => $item->quantity,
                'unit_cost' => (float) $item->unit_cost,
                'subtotal' => round((float) $item->unit_cost * $item->quantity, 2),
            ])->all()),
            'payments' => $this->whenLoaded('supplierPayments', fn () => $this->supplierPayments->map(fn ($p) => [
                'method' => $p->method,
                'amount' => (float) $p->amount,
                'reference' => $p->reference,
                'created_at' => $p->created_at?->toIso8601String(),
            ])->all()),
        ];
    }
}
