<?php

use App\Http\Controllers\Api\Admin\UserController;
use App\Http\Controllers\Api\Admin\UserLockController;
use App\Http\Controllers\Api\Admin\UserSessionController;
use App\Http\Controllers\Api\Auth\CustomerAuthController;
use App\Http\Controllers\Api\Auth\PasswordRecoveryController;
use App\Http\Controllers\Api\Auth\SessionController;
use App\Http\Controllers\Api\Auth\StaffAuthController;
use App\Http\Controllers\Api\Auth\TwoFactorController;
use App\Http\Controllers\Api\Cash\CashShiftController;
use App\Http\Controllers\Api\Inventory\MovementController;
use App\Http\Controllers\Api\Inventory\ProductController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\Portal\PortalOrderController;
use App\Http\Controllers\Api\Portal\PortalQuoteController;
use App\Http\Controllers\Api\Portal\PortalWarrantyController;
use App\Http\Controllers\Api\Pos\SaleController;
use App\Http\Controllers\Api\Workshop\AssignmentController;
use App\Http\Controllers\Api\Workshop\CustomerController;
use App\Http\Controllers\Api\Workshop\PartRequestController;
use App\Http\Controllers\Api\Workshop\QuoteController;
use App\Http\Controllers\Api\Workshop\ServiceOrderController;
use App\Http\Controllers\Api\Workshop\WarrantyController;
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

                // AD7 Usuarios y permisos (RF-01, RF-14)
                Route::get('roles', [UserController::class, 'roles']);
                Route::get('users', [UserController::class, 'index']);
                Route::post('users', [UserController::class, 'store']);
                Route::get('users/{user}', [UserController::class, 'show'])->whereNumber('user');
                Route::put('users/{user}', [UserController::class, 'update'])->whereNumber('user');
                Route::post('users/{user}/activate', [UserController::class, 'activate'])->whereNumber('user');
                Route::post('users/{user}/deactivate', [UserController::class, 'deactivate'])->whereNumber('user');
                Route::post('users/{user}/temporary-password', [UserController::class, 'temporaryPassword'])->whereNumber('user');
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

            // ── Taller: garantías (C4 mostrador, J4 jefe, T4 técnico · RF-11) ──
            Route::middleware('permission:warranties.rule,orders.receive,orders.deliver')->group(function () {
                Route::get('warranties', [WarrantyController::class, 'index']);
                Route::get('warranties/{folio}', [WarrantyController::class, 'show']);
            });
            Route::middleware('permission:orders.receive')->group(function () {
                Route::post('service-orders/{folio}/warranties', [WarrantyController::class, 'storeAtCounter']);
                Route::post('warranties/{folio}/receive', [WarrantyController::class, 'receive']);
            });
            Route::middleware('permission:warranties.rule')->group(function () {
                Route::post('warranties/{folio}/assign', [WarrantyController::class, 'assign']);
                Route::post('warranties/{folio}/rule', [WarrantyController::class, 'rule']);
            });
            Route::post('warranties/{folio}/deliver', [WarrantyController::class, 'deliver'])->middleware('permission:orders.deliver');
            Route::middleware('permission:orders.repair')->group(function () {
                Route::get('my/warranties', [WarrantyController::class, 'mine']);
                Route::post('my/warranties/{folio}/review', [WarrantyController::class, 'review']);
                Route::post('my/warranties/{folio}/finish', [WarrantyController::class, 'finish']);
            });

            // ── Taller: refacciones (T5 técnico, J5 jefe · RF-05) ──
            Route::middleware('permission:parts.request')->group(function () {
                Route::post('my/orders/{folio}/part-requests', [PartRequestController::class, 'store']);
                Route::get('my/part-requests', [PartRequestController::class, 'mine']);
                Route::post('my/part-requests/{folio}/cancel', [PartRequestController::class, 'cancel']);
                Route::get('my/order-parts', [PartRequestController::class, 'myParts']);
                Route::post('my/order-parts/{orderPart}/return', [PartRequestController::class, 'returnPart'])->whereNumber('orderPart');
            });
            Route::middleware('permission:parts.handle')->group(function () {
                Route::get('part-requests', [PartRequestController::class, 'index']);
                Route::post('part-requests/{folio}/deliver', [PartRequestController::class, 'deliver']);
                Route::post('part-requests/{folio}/reject', [PartRequestController::class, 'reject']);
                Route::get('part-returns', [PartRequestController::class, 'returns']);
                Route::post('part-returns/{partReturn}/receive', [PartRequestController::class, 'receive'])->whereNumber('partReturn');
            });

            // ── Taller: cotización del jefe y liberación de equipos (J3, J8 · RF-10, RF-17) ──
            Route::middleware('permission:orders.quote')->group(function () {
                Route::get('quotes/to-quote', [QuoteController::class, 'toQuote']);
                Route::get('quotes/{folio}', [QuoteController::class, 'show']);
                Route::post('quotes/{folio}/send', [QuoteController::class, 'send']);
                Route::post('quotes/{folio}/return', [QuoteController::class, 'returnToTechnician']);
                Route::post('service-orders/{folio}/release', [QuoteController::class, 'release']);
            });

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

            // ── Caja: turnos y cortes (C1, C10, AD3 · RF-13) ──
            Route::middleware('permission:cash.shift,cash.review_closing')->group(function () {
                Route::get('cash-registers', [CashShiftController::class, 'registers']);
                Route::get('cash-shifts', [CashShiftController::class, 'index']);
                Route::get('cash-shifts/{shift}', [CashShiftController::class, 'show'])->whereNumber('shift');
                Route::post('cash-shifts/{shift}/close', [CashShiftController::class, 'close'])->whereNumber('shift');
            });
            Route::middleware('permission:cash.shift')->group(function () {
                Route::get('cash-shifts/current', [CashShiftController::class, 'current']);
                Route::post('cash-shifts', [CashShiftController::class, 'open']);
            });
            Route::post('cash-shifts/{shift}/movements', [CashShiftController::class, 'movement'])->whereNumber('shift')->middleware('permission:cash.withdrawal');
            Route::post('cash-shifts/{shift}/review', [CashShiftController::class, 'review'])->whereNumber('shift')->middleware('permission:cash.review_closing');

            // ── Punto de venta y entrega de equipos (C2, C3, C6 · RF-08, RF-14) ──
            Route::middleware('permission:pos.sell')->group(function () {
                Route::post('sales', [SaleController::class, 'store']);
                Route::get('sales', [SaleController::class, 'index']);
                Route::get('sales/{folio}', [SaleController::class, 'show']);
            });

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

        // P1 / P2 · RF-06: solo después de crear su propia contraseña
        Route::middleware('password.changed')->group(function () {
            Route::get('orders', [PortalOrderController::class, 'index']);
            Route::get('orders/{folio}', [PortalOrderController::class, 'show']);

            // Presupuesto: ver, aprobar o rechazar (RF-07)
            Route::get('orders/{folio}/quote', [PortalQuoteController::class, 'show']);
            Route::post('quotes/{folio}/approve', [PortalQuoteController::class, 'approve']);
            Route::post('quotes/{folio}/reject', [PortalQuoteController::class, 'reject']);

            // P3 Garantía, solo si se solicita (RF-11)
            Route::get('orders/{folio}/warranty', [PortalWarrantyController::class, 'show']);
            Route::post('orders/{folio}/warranty', [PortalWarrantyController::class, 'store']);
            Route::post('warranties/{folio}/answer', [PortalWarrantyController::class, 'answer']);
        });
    });

    // P4 Información de la sucursal: pública (dirección y horario, riesgo R14)
    Route::get('portal/info', [PortalOrderController::class, 'info']);
});
