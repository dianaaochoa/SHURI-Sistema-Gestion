<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Auth\AuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserLockController extends Controller
{
    public function __construct(private readonly AuthService $auth) {}

    /** POST /users/{user}/unlock */
    public function unlock(Request $request, User $user): JsonResponse
    {
        if (! $this->auth->unlock($user, $request->user())) {
            return response()->json(['message' => "La cuenta de {$user->name} no está bloqueada."]);
        }

        return response()->json(['message' => "Cuenta de {$user->name} desbloqueada. Ya puede iniciar sesión."]);
    }
}
