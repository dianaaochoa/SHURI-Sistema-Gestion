<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Control de acceso por roles (RBAC) con los códigos de la tabla `permissions`.
 * Uso: ->middleware('permission:pos.sell')
 *        ->middleware('permission:orders.assign,orders.quote')  // cualquiera de ellos
 */
class EnsureUserHasPermission
{
    public function handle(Request $request, Closure $next, string ...$codes): Response
    {
        $user = $request->user();

        $allowed = $user instanceof User
            && collect($codes)->contains(fn (string $code) => $user->hasPermission($code));

        if (! $allowed) {
            return response()->json([
                'message' => 'No tienes permiso para realizar esta acción.',
                'code' => 'FORBIDDEN',
            ], 403);
        }

        return $next($request);
    }
}
