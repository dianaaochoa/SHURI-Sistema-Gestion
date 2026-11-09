<?php

namespace App\Http\Middleware;

use App\Models\Customer;
use App\Models\User;
use App\Services\Auth\AuthService;
use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * Separates staff tokens from customer portal tokens.
 * Usage: ->middleware('actor:staff') or ->middleware('actor:customer').
 * Must run after auth:sanctum.
 */
class EnsureActor
{
    public function handle(Request $request, Closure $next, string $actor): Response
    {
        $account = $request->user();

        $expectedClass = $actor === AuthService::STAFF ? User::class : Customer::class;

        if (! $account instanceof $expectedClass || ! $account->tokenCan($actor)) {
            return response()->json([
                'message' => 'No tienes acceso a este recurso.',
                'code' => 'WRONG_ACCOUNT_TYPE',
            ], 403);
        }

        // An account deactivated by the admin loses access immediately
        if (! $account->is_active) {
            $token = $account->currentAccessToken();
            if ($token instanceof PersonalAccessToken) {
                $token->delete();
            }

            return response()->json([
                'message' => 'Tu cuenta está desactivada.',
                'code' => 'ACCOUNT_INACTIVE',
            ], 401);
        }

        return $next($request);
    }
}
