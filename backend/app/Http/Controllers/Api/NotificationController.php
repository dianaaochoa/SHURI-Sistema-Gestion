<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Notificaciones internas del personal (campanita, C1.4): stock bajo y otros avisos.
 */
class NotificationController extends Controller
{
    /** GET /notifications — las no leídas primero */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'unread' => $user->unreadNotifications()->count(),
            'data' => $user->notifications()
                ->orderByRaw('read_at IS NULL DESC')
                ->latest()
                ->limit(30)
                ->get()
                ->map(fn ($n) => [
                    'id' => $n->id,
                    'data' => $n->data,
                    'read' => $n->read_at !== null,
                    'created_at' => $n->created_at?->toIso8601String(),
                ]),
        ]);
    }

    /** POST /notifications/{id}/read */
    public function read(Request $request, string $id): JsonResponse
    {
        $notification = $request->user()->notifications()->whereKey($id)->first();

        if (! $notification) {
            return response()->json(['message' => 'La notificación no existe.', 'code' => 'NOT_FOUND'], 404);
        }

        $notification->markAsRead();

        return response()->json(['message' => 'Notificación leída.']);
    }

    /** POST /notifications/read-all */
    public function readAll(Request $request): JsonResponse
    {
        $request->user()->unreadNotifications->markAsRead();

        return response()->json(['message' => 'Todas las notificaciones quedaron leídas.']);
    }
}
