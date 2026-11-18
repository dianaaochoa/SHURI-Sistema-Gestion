<?php

namespace App\Http\Controllers\Api\Chat;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\QuickReply;
use App\Services\Chat\ChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * J11 Mensajes de clientes: bandeja, conversación, respuestas rápidas
 * y disponibilidad del jefe (RF-12). Permiso chat.reply.
 */
class ConversationController extends Controller
{
    public function __construct(private readonly ChatService $chat) {}

    /** GET /conversations?status=open&awaiting=1 — bandeja (vista v_message_inbox) */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'status' => ['nullable', 'in:open,closed'],
            'awaiting' => ['nullable', 'boolean'],
        ]);

        $rows = DB::table('v_message_inbox')
            ->when($filters['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($filters['awaiting'] ?? false, fn ($q) => $q->where('awaiting_reply', true))
            ->orderByDesc('awaiting_reply')
            ->orderByDesc('last_message_at')
            ->limit(100)
            ->get();

        return response()->json([
            'awaiting_reply' => DB::table('conversations')->where('status', 'open')->where('awaiting_reply', true)->count(),
            'data' => $rows->map(fn ($r) => [
                'id' => $r->conversation_id,
                'status' => $r->status,
                'awaiting_reply' => (bool) $r->awaiting_reply,
                'unread' => (int) $r->unread,
                'customer' => ['id' => $r->customer_id, 'name' => trim($r->customer)],
                'service_order_folio' => $r->folio,
                'device' => $r->device ? trim($r->device) : null,
                'last_message' => $r->last_message,
                'last_message_at' => $r->last_message_at ? now()->parse($r->last_message_at)->toIso8601String() : null,
                'handled_by' => $r->handled_by,
            ]),
        ]);
    }

    /** GET /conversations/{conversation}/messages — marca como leídos los del cliente */
    public function messages(Conversation $conversation): JsonResponse
    {
        $conversation->load('customer', 'serviceOrder');

        return response()->json([
            'conversation' => [
                'id' => $conversation->id,
                'status' => $conversation->status,
                'customer' => trim("{$conversation->customer->name} {$conversation->customer->last_name}"),
                'phone' => $conversation->customer->phone,
                'service_order_folio' => $conversation->serviceOrder?->folio,
            ],
            'data' => $this->chat->read($conversation, 'staff')->map(fn (Message $m) => self::message($m, 'staff')),
        ]);
    }

    /** POST /conversations/{conversation}/messages */
    public function reply(Request $request, Conversation $conversation): JsonResponse
    {
        $data = $request->validate([
            'body' => ['nullable', 'required_without:quick_reply_id', 'string', 'max:2000'],
            'quick_reply_id' => ['nullable', 'integer'],
        ], [], ['body' => 'mensaje', 'quick_reply_id' => 'respuesta rápida']);

        $message = $this->chat->reply($conversation, $request->user(), $data['body'] ?? null, $data['quick_reply_id'] ?? null);

        return response()->json(['data' => self::message($message->load('user:id,name'), 'staff')], 201);
    }

    /** POST /conversations/{conversation}/close */
    public function close(Request $request, Conversation $conversation): JsonResponse
    {
        $this->chat->close($conversation, $request->user());

        return response()->json(['message' => 'Conversación cerrada. Se reabre sola si el cliente vuelve a escribir.']);
    }

    /** GET /quick-replies */
    public function quickReplies(): JsonResponse
    {
        return response()->json([
            'data' => QuickReply::where('is_active', true)->orderBy('sort_order')->get(['id', 'title', 'body']),
        ]);
    }

    /** PUT /chat/availability — "No disponible hoy" */
    public function availability(Request $request): JsonResponse
    {
        $data = $request->validate([
            'available' => ['required', 'boolean'],
            'unavailable_until' => ['nullable', 'date', 'after:now'],
            'message' => ['nullable', 'string', 'max:255'],
        ], [], ['available' => 'disponibilidad', 'unavailable_until' => 'hasta cuándo', 'message' => 'mensaje para los clientes']);

        $user = $this->chat->setAvailability($request->user(), $data);

        return response()->json([
            'message' => $user->chat_available ? 'Estás disponible en el chat.' : 'Los clientes verán que no estás disponible.',
            'data' => [
                'chat_available' => (bool) $user->chat_available,
                'unavailable_until' => $user->unavailable_until?->toIso8601String(),
                'unavailable_message' => $user->unavailable_message,
            ],
        ]);
    }

    /**
     * Un mensaje para la pantalla. $viewer dice de qué lado está quien lo lee,
     * para marcar los propios (mine) y mostrarlos a la derecha.
     *
     * @return array<string, mixed>
     */
    public static function message(Message $message, string $viewer): array
    {
        $author = match ($message->sender) {
            'staff' => $viewer === 'staff' ? $message->user?->name : strtok((string) $message->user?->name, ' '),
            'customer' => $viewer === 'customer' ? 'Tú' : 'Cliente',
            default => 'SHURI',
        };

        return [
            'id' => $message->id,
            'sender' => $message->sender,
            'author' => $author,
            'mine' => $message->sender === $viewer,
            'type' => $message->type,
            'body' => $message->body,
            'read_at' => $message->read_at?->toIso8601String(),
            'created_at' => $message->created_at?->toIso8601String(),
        ];
    }
}
