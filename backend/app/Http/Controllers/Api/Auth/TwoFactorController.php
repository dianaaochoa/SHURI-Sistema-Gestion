<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\VerifyTwoFactorRequest;
use App\Http\Resources\StaffUserResource;
use App\Services\Auth\AuthService;
use App\Services\Auth\TwoFactorService;
use Illuminate\Http\JsonResponse;

/**
 * Second login step for staff (MFA by email code).
 */
class TwoFactorController extends Controller
{
    public function __construct(
        private readonly TwoFactorService $twoFactor,
        private readonly AuthService $auth,
    ) {}

    /** POST /api/v1/auth/2fa/verify */
    public function verify(VerifyTwoFactorRequest $request): JsonResponse
    {
        $verified = $this->twoFactor->verify(
            $request->validated('challenge_id'),
            $request->validated('code'),
        );

        $result = $this->auth->completeLogin($verified['user'], AuthService::STAFF, $verified['device_name']);

        return response()->json([
            'token' => $result['token'],
            'token_type' => 'Bearer',
            'expires_at' => $result['expires_at']->toIso8601String(),
            'user' => new StaffUserResource($result['account']->load('role')),
        ]);
    }

    /** POST /api/v1/auth/2fa/resend */
    public function resend(VerifyTwoFactorRequest $request): JsonResponse
    {
        $challenge = $this->twoFactor->resend($request->validated('challenge_id'));

        return response()->json([
            'message' => 'Te enviamos un nuevo código.',
            'challenge_id' => $challenge['challenge_id'],
            'expires_at' => $challenge['expires_at']->toIso8601String(),
            'email_hint' => $challenge['email_hint'],
        ]);
    }
}
