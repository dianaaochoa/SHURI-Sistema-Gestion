<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ChangePasswordRequest;
use App\Http\Requests\Auth\StaffLoginRequest;
use App\Http\Resources\StaffUserResource;
use App\Services\Auth\AuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Staff access (screens A.1–A.6): Admin, Head technician, Technician, Cashier.
 */
class StaffAuthController extends Controller
{
    public function __construct(private readonly AuthService $auth) {}

    /** POST /api/v1/auth/login */
    public function login(StaffLoginRequest $request): JsonResponse
    {
        $result = $this->auth->loginStaff(
            $request->validated('login'),
            $request->validated('password'),
            $request->validated('device_name'),
        );

        // Password OK but MFA applies: Angular shows the "enter code" screen
        if ($result['mfa_required'] ?? false) {
            return response()->json([
                'mfa_required' => true,
                'challenge_id' => $result['challenge_id'],
                'expires_at' => $result['expires_at']->toIso8601String(),
                'email_hint' => $result['email_hint'],
                'message' => "Te enviamos un código de 6 dígitos a {$result['email_hint']}.",
            ]);
        }

        return response()->json([
            'mfa_required' => false,
            'token' => $result['token'],
            'token_type' => 'Bearer',
            'expires_at' => $result['expires_at']->toIso8601String(),
            'user' => new StaffUserResource($result['account']->load('role')),
        ]);
    }

    /** GET /api/v1/auth/me */
    public function me(Request $request): StaffUserResource
    {
        return new StaffUserResource($request->user()->load('role'));
    }

    /** POST /api/v1/auth/logout */
    public function logout(Request $request): JsonResponse
    {
        $this->auth->logout($request->user());

        return response()->json(['message' => 'Sesión cerrada.']);
    }

    /** PUT /api/v1/auth/password */
    public function changePassword(ChangePasswordRequest $request): JsonResponse
    {
        $this->auth->changePassword(
            $request->user(),
            $request->validated('current_password'),
            $request->validated('password'),
        );

        return response()->json(['message' => 'Contraseña actualizada. Se cerraron tus otras sesiones.']);
    }
}
