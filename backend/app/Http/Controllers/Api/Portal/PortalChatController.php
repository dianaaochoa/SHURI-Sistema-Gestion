<?php

namespace App\Http\Controllers\Api\Portal;

use App\Http\Controllers\Api\Chat\ConversationController;
use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\Message;
use App\Services\Chat\ChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * P5 Chat con el jefe de técnicos (RF-12). El cliente solo ve sus conversaciones.
 */
class PortalChatController extends Controller
{
    public function __construct(private readonly ChatService $chat) {}

    /** GET /portal/chat — mis conversaciones y si el jefe está disponible hoy */
    public function index(Request $request): JsonResponse
    {
        $conversations = Conversation::with('serviceOrder:id,folio')
            ->where('customer_id', $request->user()->id)
            ->withCount(['messages as unread' => fn ($q) => $q->where('sender', 'staff')->whereNull('read_at')])
            ->orderByDesc('last_message_at')
            ->get();

        return response()->json([
            'availability' => $this->chat->availability(),
            'data' => $conversations->map(fn (Conversation $c) => [
                'id' => $c->id,
                'status' => $c->status,
                'service_order_folio' => $c->serviceOrder?->folio,
                'unread' => (int) $c->unread,
                'last_message_at' => $c->last_message_at?->toIso8601String(),
            ]),
        ]);
    }

    /** POST /portal/chat — escribir (sobre un equipo o en general) */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'body' => ['required', 'string', 'max:2000'],
            'folio' => ['nullable', 'string', 'max:20'],
        ], [], ['body' => 'mensaje', 'folio' => 'folio']);

        $conversation = $this->chat->startFromCustomer($request->user(), $data['body'], $data['folio'] ?? null);

        return response()->json([
            'availability' => $this->chat->availability(),
            'conversation_id' => $conversation->id,
            'data' => $this->chat->read($conversation, 'customer')->map(fn (Message $m) => ConversationController::message($m, 'customer')),
        ], 201);
    }

    /** GET /portal/chat/{conversation}/messages — marca como leídas las respuestas */
    public function messages(Request $request, Conversation $conversation): JsonResponse
    {
        if ($conversation->customer_id !== $request->user()->id) {
            return response()->json(['message' => 'No encontramos esta conversación en tu cuenta.', 'code' => 'NOT_FOUND'], 404);
        }

        return response()->json([
            'availability' => $this->chat->availability(),
            'data' => $this->chat->read($conversation, 'customer')->map(fn (Message $m) => ConversationController::message($m, 'customer')),
        ]);
    }

    /** POST /portal/chat/{conversation}/messages */
    public function send(Request $request, Conversation $conversation): JsonResponse
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:2000']], [], ['body' => 'mensaje']);

        if ($conversation->customer_id !== $request->user()->id) {
            return response()->json(['message' => 'No encontramos esta conversación en tu cuenta.', 'code' => 'NOT_FOUND'], 404);
        }

        $message = $this->chat->sendFromCustomer($conversation, $request->user(), $data['body']);

        return response()->json([
            'availability' => $this->chat->availability(),
            'data' => ConversationController::message($message, 'customer'),
        ], 201);
    }
}
