<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * Se lanza cuando un movimiento dejaría el stock en negativo (RF-02:
 * "se bloquea la transacción si la cantidad es 0"). Responde HTTP 422.
 */
class InsufficientStockException extends RuntimeException
{
    public function __construct(
        public readonly string $productName,
        public readonly int $available,
        public readonly int $requested,
    ) {
        parent::__construct("Sin existencias suficientes de {$productName}.");
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => "No hay existencias suficientes de «{$this->productName}»: hay {$this->available} y se necesitan {$this->requested}.",
            'code' => 'INSUFFICIENT_STOCK',
            'available' => $this->available,
            'requested' => $this->requested,
        ], 422);
    }
}
