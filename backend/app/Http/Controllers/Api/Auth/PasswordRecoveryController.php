<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\PasswordRecoveryRequest;
use App\Http\Requests\Auth\SecurityQuestionRequest;
use App\Services\Auth\AuthService;
use App\Services\Auth\PasswordRecoveryService;
use App\Support\SecurityQuestions;
use Illuminate\Http\JsonResponse;

class PasswordRecoveryController extends Controller
{
    public function __construct(private readonly PasswordRecoveryService $recovery) {}

    /** POST /auth/password/forgot · /portal/password/forgot */
    public function forgot(PasswordRecoveryRequest $request): JsonResponse
    {
        $actor = $request->route('actor');
        $result = $this->recovery->start($actor, $request->validated('login'));

        if ($result === null) {
            // Same answer if the account does not exist or has no question
            return response()->json([
                'requires_answer' => false,
                'message' => $actor === AuthService::STAFF
                    ? 'No podemos recuperar esta cuenta en línea. Pide una contraseña temporal al administrador.'
                    : 'No podemos recuperar esta cuenta en línea. Pide una contraseña temporal en la sucursal.',
            ]);
        }

        return response()->json(['requires_answer' => true] + $result);
    }

    /** POST /auth/password/answer · /portal/password/answer */
    public function answer(PasswordRecoveryRequest $request): JsonResponse
    {
        $result = $this->recovery->answer(
            $request->route('actor'),
            $request->validated('recovery_id'),
            $request->validated('answer'),
        );

        return response()->json([
            'email_hint' => $result['email_hint'],
            'message' => "Te enviamos una contraseña temporal a {$result['email_hint']}. Entra con ella y el sistema te pedirá crear tu nueva contraseña.",
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
