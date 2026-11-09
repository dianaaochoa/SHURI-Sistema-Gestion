<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\PasswordRecoveryRequest;
use App\Http\Requests\Auth\SecurityQuestionRequest;
use App\Services\Auth\PasswordRecoveryService;
use App\Support\SecurityQuestions;
use Illuminate\Http\JsonResponse;

/**
 * "¿Olvidaste tu contraseña?" for staff (A.3) and customers (portal).
 * The route tells which one with ->defaults('actor', 'staff'|'customer').
 */
class PasswordRecoveryController extends Controller
{
    public function __construct(private readonly PasswordRecoveryService $recovery) {}

    /** POST /auth/password/forgot · /portal/password/forgot */
    public function forgot(PasswordRecoveryRequest $request): JsonResponse
    {
        $this->recovery->requestReset($request->route('actor'), $request->validated('email'));

        // Same answer whether the email exists or not
        return response()->json([
            'message' => 'Si el correo está registrado, te enviamos un enlace para crear una nueva contraseña.',
        ]);
    }

    /** POST /auth/password/verify-token · /portal/password/verify-token */
    public function verifyToken(PasswordRecoveryRequest $request): JsonResponse
    {
        $result = $this->recovery->checkToken(
            $request->route('actor'),
            $request->validated('email'),
            $request->validated('token'),
        );

        return response()->json([
            'valid' => true,
            'requires_answer' => $result['security_question'] !== null,
            'security_question' => $result['security_question'],
        ]);
    }

    /** POST /auth/password/reset · /portal/password/reset */
    public function reset(PasswordRecoveryRequest $request): JsonResponse
    {
        $this->recovery->reset(
            $request->route('actor'),
            $request->validated('email'),
            $request->validated('token'),
            $request->validated('answer'),
            $request->validated('password'),
        );

        return response()->json([
            'message' => 'Tu contraseña se cambió. Inicia sesión con la nueva contraseña.',
        ]);
    }

    /** GET /security-questions — catalog for the "configure question" screen */
    public function questions(): JsonResponse
    {
        return response()->json([
            'data' => collect(SecurityQuestions::ALL)
                ->map(fn (string $text, string $key) => ['key' => $key, 'text' => $text])
                ->values(),
        ]);
    }

    /** PUT /auth/security-question · /portal/security-question */
    public function setQuestion(SecurityQuestionRequest $request): JsonResponse
    {
        $this->recovery->setSecurityQuestion(
            $request->user(),
            $request->validated('current_password'),
            $request->validated('question'),
            $request->validated('answer'),
        );

        return response()->json(['message' => 'Pregunta de seguridad guardada.']);
    }
}
