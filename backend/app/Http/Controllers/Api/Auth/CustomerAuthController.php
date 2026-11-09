<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ChangePasswordRequest;
use App\Http\Requests\Auth\CustomerLoginRequest;
use App\Http\Resources\CustomerResource;
use App\Services\Auth\AuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Customer portal access (screen P1): email + temporary password on first access.
 */
class CustomerAuthController extends Controller
{
    public function __construct(private readonly AuthService $auth) {}

    /** POST /api/v1/portal/login */
    public function login(CustomerLoginRequest $request): JsonResponse
    {
        $result = $this->auth->loginCustomer(
            $request->validated('email'),
            $request->validated('password'),
            $request->validated('device_name'),
        );

        return response()->json([
            'token' => $result['token'],
            'token_type' => 'Bearer',
            'expires_at' => $result['expires_at']->toIso8601String(),
            'customer' => new CustomerResource($result['account']),
        ]);
    }

    /** GET /api/v1/portal/me */
    public function me(Request $request): CustomerResource
    {
        return new CustomerResource($request->user());
    }

    /** POST /api/v1/portal/logout */
    public function logout(Request $request): JsonResponse
    {
        $this->auth->logout($request->user());

        return response()->json(['message' => 'Sesión cerrada.']);
    }

    /** PUT /api/v1/portal/password */
    public function changePassword(ChangePasswordRequest $request): JsonResponse
    {
        $this->auth->changePassword(
            $request->user(),
            $request->validated('current_password'),
            $request->validated('password'),
        );

        return response()->json(['message' => 'Contraseña creada. Ya puedes ver tus equipos.']);
    }
}
