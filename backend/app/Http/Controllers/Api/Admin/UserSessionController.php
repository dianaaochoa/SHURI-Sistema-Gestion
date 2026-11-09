<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\SessionResource;
use App\Models\User;
use App\Services\Auth\SessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * AD7 Users and permissions: device control. The admin sees where each
 * staff member is logged in and can close their sessions (lost phone, dismissal).
 * Route protected with permission:users.manage.
 */
class UserSessionController extends Controller
{
    public function __construct(private readonly SessionService $sessions) {}

    /** GET /users/{user}/sessions */
    public function index(User $user): AnonymousResourceCollection
    {
        return SessionResource::collection($this->sessions->active($user));
    }

    /** DELETE /users/{user}/sessions/{session} */
    public function destroy(Request $request, User $user, int $session): JsonResponse
    {
        if (! $this->sessions->revoke($user, $session, $request->user())) {
            return response()->json(['message' => 'La sesión no existe.', 'code' => 'NOT_FOUND'], 404);
        }

        return response()->json(['message' => 'Sesión cerrada.']);
    }

    /** DELETE /users/{user}/sessions */
    public function destroyAll(Request $request, User $user): JsonResponse
    {
        $closed = $this->sessions->revokeAll($user, $request->user());

        return response()->json([
            'message' => "Se cerraron {$closed} sesión(es) de {$user->name}.",
            'closed' => $closed,
        ]);
    }
}
