<?php

use App\Http\Controllers\Api\Admin\UserLockController;
use App\Http\Controllers\Api\Admin\UserSessionController;
use App\Http\Controllers\Api\Auth\CustomerAuthController;
use App\Http\Controllers\Api\Auth\PasswordRecoveryController;
use App\Http\Controllers\Api\Auth\SessionController;
use App\Http\Controllers\Api\Auth\StaffAuthController;
use App\Http\Controllers\Api\Auth\TwoFactorController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| SHURI API v1  —  prefix: /api/v1
|--------------------------------------------------------------------------
| Layers of protection:
|  1. Public + throttle:login          → login endpoints (brute-force protection)
|  2. auth:sanctum + actor:<type>     → valid token of the right account type
|  3. password.changed                → temporary password already replaced
|  4. permission:<code>               → RBAC per action (permissions table)
*/

Route::prefix('v1')->group(function () {

    // ── Public ──────────────────────────────────────────────────────────
    Route::middleware('throttle:login')->group(function () {
        Route::post('auth/login', [StaffAuthController::class, 'login']);
        Route::post('auth/2fa/verify', [TwoFactorController::class, 'verify'])->name('auth.2fa.verify');
        Route::post('auth/2fa/resend', [TwoFactorController::class, 'resend'])->name('auth.2fa.resend');
        Route::post('portal/login', [CustomerAuthController::class, 'login']);

        // Password recovery (A.3): security question → temporary password by email
        foreach (['auth' => 'staff', 'portal' => 'customer'] as $prefix => $actor) {
            Route::post("{$prefix}/password/forgot", [PasswordRecoveryController::class, 'forgot'])
                ->defaults('actor', $actor)->name("{$prefix}.password.forgot");
            Route::post("{$prefix}/password/answer", [PasswordRecoveryController::class, 'answer'])
                ->defaults('actor', $actor)->name("{$prefix}.password.answer");
        }
    });

    Route::get('security-questions', [PasswordRecoveryController::class, 'questions']);

    // ── Staff (Admin, Head technician, Technician, Cashier) ────────────
    Route::middleware(['auth:sanctum', 'actor:staff'])->group(function () {
        Route::get('auth/me', [StaffAuthController::class, 'me']);
        Route::post('auth/logout', [StaffAuthController::class, 'logout']);
        Route::put('auth/password', [StaffAuthController::class, 'changePassword']);
        Route::put('auth/security-question', [PasswordRecoveryController::class, 'setQuestion']);

        // Multi-session: my active sessions
        Route::get('auth/sessions', [SessionController::class, 'index']);
        Route::delete('auth/sessions', [SessionController::class, 'destroyOthers']);
        Route::delete('auth/sessions/{session}', [SessionController::class, 'destroy'])->whereNumber('session');

        Route::middleware('password.changed')->group(function () {
            // AD7 device control: sessions of any staff member
            Route::middleware('permission:users.manage')->group(function () {
                Route::get('users/{user}/sessions', [UserSessionController::class, 'index']);
                Route::delete('users/{user}/sessions', [UserSessionController::class, 'destroyAll']);
                Route::delete('users/{user}/sessions/{session}', [UserSessionController::class, 'destroy'])->whereNumber('session');
                Route::post('users/{user}/unlock', [UserLockController::class, 'unlock']);
            });

            // Module routes go here, each one with its permission, e.g.:
            // Route::post('sales', [SaleController::class, 'store'])->middleware('permission:pos.sell');
        });
    });

    // ── Customer portal ─────────────────────────────────────────────────
    Route::prefix('portal')->middleware(['auth:sanctum', 'actor:customer'])->group(function () {
        Route::get('me', [CustomerAuthController::class, 'me']);
        Route::post('logout', [CustomerAuthController::class, 'logout']);
        Route::put('password', [CustomerAuthController::class, 'changePassword']);
        Route::put('security-question', [PasswordRecoveryController::class, 'setQuestion']);

        Route::get('sessions', [SessionController::class, 'index']);
        Route::delete('sessions', [SessionController::class, 'destroyOthers']);
        Route::delete('sessions/{session}', [SessionController::class, 'destroy'])->whereNumber('session');

        Route::middleware('password.changed')->group(function () {
            // Portal routes (P1–P5) go here
        });
    });
});
