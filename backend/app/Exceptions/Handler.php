<?php

namespace App\Exceptions;

use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Throwable;

class Handler extends ExceptionHandler
{
    /**
     * The list of the inputs that are never flashed to the session on validation exceptions.
     *
     * @var array<int, string>
     */
    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    /**
     * Register the exception handling callbacks for the application.
     */
    public function register(): void
    {
        $this->reportable(function (Throwable $e) {
            //
        });

        // Errores JSON uniformes para la API: { message, code }
        $this->renderable(function (AuthenticationException $e, Request $request) {
            if ($request->is('api/*')) {
                return $this->apiError('Tu sesión no es válida o expiró. Inicia sesión de nuevo.', 'UNAUTHENTICATED', 401);
            }
        });

        $this->renderable(function (NotFoundHttpException $e, Request $request) {
            if ($request->is('api/*')) {
                return $this->apiError('El recurso solicitado no existe.', 'NOT_FOUND', 404);
            }
        });

        $this->renderable(function (MethodNotAllowedHttpException $e, Request $request) {
            if ($request->is('api/*')) {
                return $this->apiError('Método no permitido para esta ruta.', 'METHOD_NOT_ALLOWED', 405);
            }
        });

        $this->renderable(function (ThrottleRequestsException $e, Request $request) {
            if ($request->is('api/*')) {
                return $this->apiError('Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.', 'TOO_MANY_REQUESTS', 429)
                    ->withHeaders($e->getHeaders());
            }
        });

        // Cualquier otro error inesperado: nunca exponer detalles internos salvo con APP_DEBUG=true
        $this->renderable(function (Throwable $e, Request $request) {
            $handledElsewhere = $e instanceof HttpExceptionInterface
                || $e instanceof ValidationException
                || $e instanceof HttpResponseException;

            if ($request->is('api/*') && ! config('app.debug') && ! $handledElsewhere) {
                return $this->apiError('Ocurrió un error inesperado. Intenta de nuevo.', 'SERVER_ERROR', 500);
            }
        });
    }

    private function apiError(string $message, string $code, int $status): JsonResponse
    {
        return response()->json(['message' => $message, 'code' => $code], $status);
    }
}
