<?php

use App\Http\Controllers\Api\Admin\UserLockController;
use App\Http\Controllers\Api\Admin\UserSessionController;
use App\Http\Controllers\Api\Auth\CustomerAuthController;
use App\Http\Controllers\Api\Auth\PasswordRecoveryController;
use App\Http\Controllers\Api\Auth\SessionController;
use App\Http\Controllers\Api\Auth\StaffAuthController;
use App\Http\Controllers\Api\Auth\TwoFactorController;
use App\Http\Controllers\Api\Inventory\MovementController;
use App\Http\Controllers\Api\Inventory\ProductController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\Workshop\AssignmentController;
use App\Http\Controllers\Api\Workshop\CustomerController;
use App\Http\Controllers\Api\Workshop\ServiceOrderController;
use App\Http\Controllers\Api\Workshop\WorkbenchController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {

    // Publicas
    Route::middleware('throttle:login')->group(function () {
        Route::post('auth/login', [StaffAuthController::class, 'login']);
        Route::post('auth/2fa/verify', [TwoFactorController::class, 'verify'])->name('auth.2fa.verify');
        Route::post('auth/2fa/resend', [TwoFactorController::class, 'resend'])->name('auth.2fa.resend');
        Route::post('portal/login', [CustomerAuthController::class, 'login']);

        // Recuperar Contraseña: pregunta de seguridad → contraseña temporal por correo
        foreach (['auth' => 'staff', 'portal' => 'customer'] as $prefix => $actor) {
            Route::post("{$prefix}/password/forgot", [PasswordRecoveryController::class, 'forgot'])
                ->defaults('actor', $actor)->name("{$prefix}.password.forgot");
            Route::post("{$prefix}/password/answer", [PasswordRecoveryController::class, 'answer'])
                ->defaults('actor', $actor)->name("{$prefix}.password.answer");
        }
    });

    Route::get('security-questions', [PasswordRecoveryController::class, 'questions']);

    // Personal
    Route::middleware(['auth:sanctum', 'actor:staff'])->group(function () {
        Route::get('auth/me', [StaffAuthController::class, 'me']);
        Route::post('auth/logout', [StaffAuthController::class, 'logout']);
        Route::put('auth/password', [StaffAuthController::class, 'changePassword']);
        Route::put('auth/security-question', [PasswordRecoveryController::class, 'setQuestion']);

        // Multisesión: sesiones activas
        Route::get('auth/sessions', [SessionController::class, 'index']);
        Route::delete('auth/sessions', [SessionController::class, 'destroyOthers']);
        Route::delete('auth/sessions/{session}', [SessionController::class, 'destroy'])->whereNumber('session');

        Route::middleware('password.changed')->group(function () {
            Route::middleware('permission:users.manage')->group(function () {
                Route::get('users/{user}/sessions', [UserSessionController::class, 'index']);
                Route::delete('users/{user}/sessions', [UserSessionController::class, 'destroyAll']);
                Route::delete('users/{user}/sessions/{session}', [UserSessionController::class, 'destroy'])->whereNumber('session');
                Route::post('users/{user}/unlock', [UserLockController::class, 'unlock']);
            });

            // recepcion
            Route::get('order-statuses', [ServiceOrderController::class, 'statuses']);

            Route::middleware('permission:orders.receive,orders.deliver,orders.assign,orders.quote')->group(function () {
                Route::get('service-orders', [ServiceOrderController::class, 'index']);
                Route::get('service-orders/{folio}', [ServiceOrderController::class, 'show']);
            });
            Route::post('service-orders', [ServiceOrderController::class, 'store'])->middleware('permission:orders.receive');

            // ── Taller: asignación (J1, J2, J7 · RF-04) ──
            Route::middleware('permission:orders.assign')->group(function () {
                Route::get('workshop/board', [AssignmentController::class, 'board']);
                Route::get('technicians', [AssignmentController::class, 'technicians']);
                Route::post('service-orders/{folio}/assign', [AssignmentController::class, 'assign']);
            });

            // ── Taller: banco de trabajo del técnico (T2, T3 · RF-05) ──
            Route::middleware('permission:orders.repair')->prefix('my/orders')->group(function () {
                Route::get('/', [WorkbenchController::class, 'index']);
                Route::get('{folio}', [WorkbenchController::class, 'show']);
                Route::post('{folio}/start', [WorkbenchController::class, 'start']);
                Route::post('{folio}/pause', [WorkbenchController::class, 'pause']);
                Route::post('{folio}/resume', [WorkbenchController::class, 'resume']);
                Route::post('{folio}/diagnosis', [WorkbenchController::class, 'diagnosis']);
            });
            Route::get('labor-levels', [WorkbenchController::class, 'laborLevels'])->middleware('permission:orders.repair,orders.quote');

            // ── Inventario (C7, J6, AD4 · RF-02) ──
            Route::middleware('permission:inventory.view')->group(function () {
                Route::get('categories', [ProductController::class, 'categories']);
                Route::get('products', [ProductController::class, 'index']);
                Route::get('products/{product}', [ProductController::class, 'show'])->whereNumber('product');
                Route::get('inventory/movements', [MovementController::class, 'index']);
            });
            Route::post('products', [ProductController::class, 'store'])->middleware('permission:catalog.prices,inventory.stock_in');
            Route::put('products/{product}', [ProductController::class, 'update'])->whereNumber('product')->middleware('permission:catalog.prices');
            Route::post('inventory/stock-in', [MovementController::class, 'stockIn'])->middleware('permission:inventory.stock_in');
            Route::post('inventory/adjustments', [MovementController::class, 'adjust'])->middleware('permission:inventory.adjust');

            // ── Notificaciones internas (campanita) ──
            Route::get('notifications', [NotificationController::class, 'index']);
            Route::post('notifications/read-all', [NotificationController::class, 'readAll']);
            Route::post('notifications/{id}/read', [NotificationController::class, 'read']);

            Route::middleware('permission:customers.manage,orders.receive')->group(function () {
                Route::get('customers', [CustomerController::class, 'index']);
                Route::get('customers/{customer}', [CustomerController::class, 'show'])->whereNumber('customer');
            });
            Route::middleware('permission:customers.manage')->group(function () {
                Route::post('customers', [CustomerController::class, 'store']);
                Route::post('customers/{customer}/temporary-password', [CustomerController::class, 'temporaryPassword'])->whereNumber('customer');
            });
        });
    });

    // ── Portal Cliente ─────────────────────────────────────────────────
    Route::prefix('portal')->middleware(['auth:sanctum', 'actor:customer'])->group(function () {
        Route::get('me', [CustomerAuthController::class, 'me']);
        Route::post('logout', [CustomerAuthController::class, 'logout']);
        Route::put('password', [CustomerAuthController::class, 'changePassword']);
        Route::put('security-question', [PasswordRecoveryController::class, 'setQuestion']);

        Route::get('sessions', [SessionController::class, 'index']);
        Route::delete('sessions', [SessionController::class, 'destroyOthers']);
        Route::delete('sessions/{session}', [SessionController::class, 'destroy'])->whereNumber('session');

        Route::middleware('password.changed')->group(function () {});
    });
});
