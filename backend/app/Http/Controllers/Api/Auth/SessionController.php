<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Http\Resources\SessionResource;
use App\Services\Auth\SessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * "Mis sesiones": the logged-in staff member or customer manages
 * their own sessions on other devices.
 */
class SessionController extends Controller
{
    public function __construct(private readonly SessionService $sessions) {}

    /** GET /auth/sessions · GET /portal/sessions */
    public function index(Request $request): AnonymousResourceCollection
    {
        return SessionResource::collection($this->sessions->active($request->user()));
    }

    /** DELETE /auth/sessions/{session} · DELETE /portal/sessions/{session} */
    public function destroy(Request $request, int $session): JsonResponse
    {
        if (! $this->sessions->revoke($request->user(), $session)) {
            return response()->json(['message' => 'La sesión no existe.', 'code' => 'NOT_FOUND'], 404);
        }

        return response()->json(['message' => 'Sesión cerrada.']);
    }

    /** DELETE /auth/sessions · DELETE /portal/sessions — keeps the current one */
    public function destroyOthers(Request $request): JsonResponse
    {
        $closed = $this->sessions->revokeOthers($request->user());

        return response()->json([
            'message' => "Se cerraron {$closed} sesión(es) en otros dispositivos.",
            'closed' => $closed,
        ]);
    }
}
