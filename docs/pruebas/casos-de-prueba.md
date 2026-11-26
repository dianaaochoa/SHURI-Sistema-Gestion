# 📋 Casos de prueba · SHURI

Casos derivados del [plan de pruebas](plan-de-pruebas.md). Cada caso automatizado indica la prueba que lo ejecuta (`archivo › prueba`), dentro de `backend/tests/`.

**Última ejecución:** 24 de noviembre de 2026, sobre el commit `31ca27e` · `php artisan test` → **269 pruebas aprobadas (1,449 verificaciones)**.

**Estados:** ✅ Aprobado · ❌ Fallido · ⏳ Pendiente (aún no ejecutado) · 🔁 Reprobado y corregido

**Usuarios de prueba** (`migrate:fresh --seed`): `admin` (administrador), `jefe` (jefe de técnicos), `carlos` y `laura` (técnicos), `sofia` (cajera).

---

## 1. Autenticación del personal

| ID | Descripción | Precondiciones | Pasos | Resultado esperado | Resultado obtenido | Estado | Evidencia |
|---|---|---|---|---|---|---|---|
| CP-AUT-01 | Inicio de sesión con usuario y contraseña | Usuario activo, MFA desactivado | 1. `POST /auth/login` con usuario y contraseña correctos | 200 con token y lista de permisos | 200 con token y permisos | ✅ | `Auth/StaffAuthTest › staff_can_log_in_with_username_and_receives_token_and_permissions` |
| CP-AUT-02 | Inicio de sesión con correo | Usuario activo | 1. Iniciar sesión con el correo en lugar del usuario | 200 con token | 200 con token | ✅ | `StaffAuthTest › staff_can_log_in_with_email` |
| CP-AUT-03 | Contraseña incorrecta no revela si el usuario existe | Usuario activo | 1. Contraseña incorrecta<br>2. Usuario inexistente | El mismo mensaje genérico en ambos casos; se cuenta el intento | Mismo mensaje; intento registrado | ✅ | `StaffAuthTest › wrong_password_returns_generic_message_and_counts_the_attempt`, `unknown_user_gets_the_same_generic_message` |
| CP-AUT-04 | Bloqueo tras 3 intentos fallidos | Usuario activo | 1. Tres contraseñas incorrectas<br>2. Intentar con la correcta | Cuenta bloqueada hasta que el administrador la desbloquee | Bloqueada; solo el admin la desbloquea | ✅ | `StaffAuthTest › account_is_locked_after_three_failed_attempts_until_the_admin_unlocks_it` |
| CP-AUT-05 | Límite de peticiones en el login | — | 1. Enviar muchas peticiones de login seguidas | 429 Too Many Requests | 429 | ✅ | `StaffAuthTest › login_endpoint_is_rate_limited` |
| CP-AUT-06 | Usuario desactivado no puede entrar | Usuario con `active = 0` | 1. Iniciar sesión | Acceso denegado | Denegado | ✅ | `StaffAuthTest › inactive_user_cannot_log_in` |
| CP-AUT-07 | Cerrar sesión revoca el token | Sesión iniciada | 1. `POST /auth/logout`<br>2. Usar el mismo token | 401 al reutilizar el token | 401 | ✅ | `StaffAuthTest › logout_revokes_the_current_token` |
| CP-AUT-08 | Token vencido es rechazado | Token con fecha de expiración pasada | 1. Llamar `GET /auth/me` | 401 | 401 | ✅ | `StaffAuthTest › expired_token_is_rejected` |
| CP-AUT-09 | Desactivar a un usuario le quita el acceso al instante | Usuario con sesión abierta | 1. El admin lo desactiva<br>2. El usuario hace una petición | 401/403 inmediato | Acceso retirado | ✅ | `StaffAuthTest › deactivated_user_loses_access_immediately` |

## 2. Autenticación multifactor (MFA)

| ID | Descripción | Precondiciones | Pasos | Resultado esperado | Resultado obtenido | Estado | Evidencia |
|---|---|---|---|---|---|---|---|
| CP-MFA-01 | La contraseña sola no abre sesión | MFA activado | 1. Login correcto | Se pide el código; no se entrega token | Se pide código, sin token | ✅ | `Auth/TwoFactorTest › password_alone_does_not_open_a_session_when_mfa_is_on` |
| CP-MFA-02 | El código correcto abre la sesión | Reto MFA pendiente | 1. `POST /auth/2fa/verify` con el código del correo | 200 con token | 200 con token | ✅ | `TwoFactorTest › correct_code_opens_the_session` |
| CP-MFA-03 | El código solo sirve una vez | Código ya usado | 1. Reutilizar el código | Rechazado | Rechazado | ✅ | `TwoFactorTest › code_can_only_be_used_once` |
| CP-MFA-04 | Código vencido | Código expirado | 1. Verificar | Rechazado | Rechazado | ✅ | `TwoFactorTest › expired_code_is_rejected` |
| CP-MFA-05 | Reto anulado tras 5 códigos incorrectos | Reto pendiente | 1. Cinco códigos incorrectos | Reto anulado; hay que volver a iniciar sesión | Anulado | ✅ | `TwoFactorTest › challenge_is_burned_after_five_wrong_codes` |
| CP-MFA-06 | Los códigos se guardan cifrados | — | 1. Revisar `two_factor_challenges` | Código y reto con hash, nunca en texto plano | Con hash | ✅ | `TwoFactorTest › code_and_challenge_are_stored_hashed` |
| CP-MFA-07 | Pantalla de código MFA en el navegador | Frontend y API corriendo | 1. Entrar con `jefe`<br>2. Capturar el código del correo | Entra a su módulo | — | ⏳ | E2E pendiente (Playwright) |

## 3. Multisesión

| ID | Descripción | Precondiciones | Pasos | Resultado esperado | Resultado obtenido | Estado | Evidencia |
|---|---|---|---|---|---|---|---|
| CP-SES-01 | Listar solo mis sesiones activas | Dos sesiones del mismo usuario | 1. `GET /auth/sessions` | Lista con IP, dispositivo y cuál es la actual | Correcto | ✅ | `Auth/SessionTest › user_lists_only_own_active_sessions_and_sees_which_is_current` |
| CP-SES-02 | Cerrar una sesión de otro dispositivo | Dos sesiones | 1. Cerrar la sesión B desde la A | La sesión B pierde el acceso | Pierde el acceso | ✅ | `SessionTest › user_closes_a_session_on_another_device` |
| CP-SES-03 | No se puede cerrar la sesión de otra persona | Sesión de otro usuario | 1. Intentar cerrarla | 404/403 | Denegado | ✅ | `SessionTest › user_cannot_close_someone_elses_session` |
| CP-SES-04 | Cerrar todas las demás sesiones | Tres sesiones | 1. `DELETE /auth/sessions` | Solo queda la actual | Solo la actual | ✅ | `SessionTest › close_all_other_sessions_keeps_the_current_one` |
| CP-SES-05 | El administrador cierra las sesiones de un empleado | Empleado con sesiones | 1. `DELETE /users/{id}/sessions` | Todas cerradas | Cerradas | ✅ | `SessionTest › admin_sees_and_closes_all_sessions_of_a_staff_member` |
| CP-SES-06 | Pantalla "Mis sesiones" | Integración terminada | 1. Abrir Mi perfil → Sesiones<br>2. Cerrar otra sesión | La otra pestaña regresa al login | — | ⏳ | E2E pendiente |

## 4. Recuperación de contraseña

| ID | Descripción | Precondiciones | Pasos | Resultado esperado | Resultado obtenido | Estado | Evidencia |
|---|---|---|---|---|---|---|---|
| CP-REC-01 | Flujo completo: pregunta → contraseña temporal → nueva contraseña | Usuario con pregunta secreta | 1. `forgot`<br>2. `answer` correcta<br>3. Entrar con la temporal y crear la nueva | Contraseña cambiada | Correcto | ✅ | `Auth/PasswordRecoveryTest › full_flow_question_then_temporary_password_then_create_password` |
| CP-REC-02 | No revela si el usuario existe | — | 1. `forgot` con usuario inexistente | Misma respuesta que con un usuario real | Igual | ✅ | `PasswordRecoveryTest › unknown_user_and_user_without_question_get_the_same_answer` |
| CP-REC-03 | 3 respuestas incorrectas cancelan la recuperación | Recuperación iniciada | 1. Tres respuestas incorrectas | Recuperación cancelada | Cancelada | ✅ | `PasswordRecoveryTest › three_wrong_answers_cancel_the_recovery` |
| CP-REC-04 | La recuperación vence a los 15 minutos | Recuperación de hace 16 min | 1. Responder | Rechazada | Rechazada | ✅ | `PasswordRecoveryTest › recovery_expires_after_fifteen_minutes` |
| CP-REC-05 | La contraseña temporal no se guarda en texto plano | — | 1. Revisar la BD | Solo hash | Solo hash | ✅ | `PasswordRecoveryTest › temporary_password_is_not_stored_in_plain_text` |
| CP-REC-06 | El cliente recupera su acceso por correo | Cliente del portal | 1. Recuperar con su correo | Recibe contraseña temporal | Correcto | ✅ | `PasswordRecoveryTest › customer_recovers_portal_access_with_email` |
| CP-REC-07 | Recuperación desde el navegador | Frontend integrado | 1. "Olvidé mi contraseña" → responder → crear contraseña | Entra con la nueva contraseña | — | ⏳ | E2E pendiente |

## 5. Control de acceso y seguridad

| ID | Descripción | Precondiciones | Pasos | Resultado esperado | Resultado obtenido | Estado | Evidencia |
|---|---|---|---|---|---|---|---|
| CP-SEG-01 | El técnico no puede usar el punto de venta (RF-01) | Sesión de técnico | 1. Llamar a una ruta del POS | 403 | 403 | ✅ | `Auth/AccessControlTest › technician_cannot_use_the_point_of_sale` |
| CP-SEG-02 | Token del cliente no entra a rutas del personal | Token del portal | 1. Llamar a una ruta interna | 403 | 403 | ✅ | `AccessControlTest › customer_token_cannot_reach_staff_routes` |
| CP-SEG-03 | Token del personal no entra al portal | Token del personal | 1. Llamar a una ruta del portal | 403 | 403 | ✅ | `AccessControlTest › staff_token_cannot_reach_portal_routes` |
| CP-SEG-04 | Un cliente no ve el folio de otro (IDOR) | Dos clientes | 1. Consultar el folio ajeno | 404 | 404 | ✅ | `Portal/PortalTest › another_customers_folio_returns_404` |
| CP-SEG-05 | Encabezados de seguridad OWASP en todas las respuestas | — | 1. Revisar encabezados en respuestas correctas y de error | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, etc.; HSTS solo con HTTPS | Presentes | ✅ | `Security/SecurityHeadersTest` (3 pruebas) |
| CP-SEG-06 | El PIN del equipo se guarda cifrado | Orden con PIN | 1. Revisar la BD | PIN cifrado | Cifrado | ✅ | `Workshop/ReceptionTest › device_pin_is_stored_encrypted` |
| CP-SEG-07 | Nadie puede asignar el rol de súper usuario | Sesión de admin | 1. Intentar asignar el rol | Rechazado | Rechazado | ✅ | `Admin/SuperUserTest › nobody_can_assign_the_super_user_role_from_the_users_screen` |
| CP-SEG-08 | Inyección SQL en búsquedas y login | — | 1. Enviar `' OR 1=1 --` en usuario y en la búsqueda de folios | Sin acceso ni error 500; consultas parametrizadas | — | ⏳ | Prueba pendiente (Brisa) |
| CP-SEG-09 | XSS almacenado en campos de texto | — | 1. Guardar `<script>alert(1)</script>` en la falla reportada<br>2. Verla en el portal | Se muestra como texto, no se ejecuta | — | ⏳ | Prueba pendiente (Brisa + Félix) |
| CP-SEG-10 | CSRF | API con token Bearer | 1. Petición desde otro origen sin token | 401; CORS solo permite el frontend | — | ⏳ | Prueba pendiente (Brisa) |
| CP-SEG-11 | Rutas del frontend protegidas por rol | Frontend integrado | 1. Como cajera, escribir `/jefe/inicio` en la URL | Regresa a su inicio | — | ⏳ | E2E pendiente |

## 6. Taller (MVP prioridades 1 y 2)

| ID | Descripción | Precondiciones | Pasos | Resultado esperado | Resultado obtenido | Estado | Evidencia |
|---|---|---|---|---|---|---|---|
| CP-TAL-01 | Recepción de equipo de cliente nuevo (RF-03) | Sesión de cajera | 1. Registrar cliente, equipo y falla | Orden con folio único y correo con acceso al portal | Correcto | ✅ | `Workshop/ReceptionTest › cashier_receives_a_device_of_a_new_customer`, `reception_email_has_folio_and_portal_access` |
| CP-TAL-02 | Folios consecutivos | Varias recepciones | 1. Recibir tres equipos | Folios consecutivos sin huecos | Correcto | ✅ | `ReceptionTest › folios_are_consecutive` |
| CP-TAL-03 | Si la recepción falla a la mitad, no se guarda nada (RNF-04) | Error simulado | 1. Recepción que falla | Rollback completo | Nada guardado | ✅ | `ReceptionTest › nothing_is_saved_if_reception_fails_midway` |
| CP-TAL-04 | Asignación a técnico (RF-04) | Orden recibida | 1. El jefe asigna a un técnico | Estado "Asignado"; queda en la bitácora | Correcto | ✅ | `Workshop/AssignmentTest › head_assigns_a_received_order_to_a_technician`, `assignment_is_written_to_the_order_log` |
| CP-TAL-05 | El técnico solo ve sus órdenes | Órdenes de dos técnicos | 1. Listar como `carlos` | Solo las suyas | Correcto | ✅ | `Workshop/WorkbenchTest › technician_sees_only_his_own_orders` |
| CP-TAL-06 | Un técnico no trabaja dos órdenes a la vez | Orden en curso | 1. Iniciar otra | Rechazado | Rechazado | ✅ | `WorkbenchTest › a_technician_cannot_work_on_two_orders_at_the_same_time` |
| CP-TAL-07 | Cotización y aprobación del cliente (RF-07, RF-10) | Diagnóstico hecho | 1. El jefe cotiza y envía<br>2. El cliente aprueba en el portal | Orden pasa a "En reparación" | Correcto | ✅ | `Workshop/QuoteTest › head_prices_and_sends_the_quote_with_catalog_prices`, `customer_approves_from_the_portal_and_the_order_goes_to_repair` |
| CP-TAL-08 | Flujo completo del MVP | Base limpia | 1. Recepción → asignación → diagnóstico → cotización → aprobación → reparación → entrega → consulta en el portal | Cada paso cambia el estado y el cliente lo ve | Correcto | ✅ | `Portal/PortalTest › full_mvp_flow_from_reception_to_the_customer_portal` |
| CP-TAL-09 | El flujo de estados solo permite transiciones válidas | — | 1. Probar transiciones del diagrama | Las no permitidas lanzan error | Correcto | ✅ | `Unit/OrderStatusFlowTest` (5 pruebas) |

## 7. Caja, punto de venta e inventario (MVP prioridad 3)

| ID | Descripción | Precondiciones | Pasos | Resultado esperado | Resultado obtenido | Estado | Evidencia |
|---|---|---|---|---|---|---|---|
| CP-POS-01 | No se vende sin turno abierto | Cajera sin turno | 1. Intentar una venta | Rechazado | Rechazado | ✅ | `Pos/PosTest › cashier_needs_an_open_shift_to_sell` |
| CP-POS-02 | Venta con cambio, IVA y salida de stock (RF-02, RF-08) | Turno abierto, producto con stock | 1. Vender y pagar en efectivo | Ticket, cambio correcto y stock descontado | Correcto | ✅ | `PosTest › sells_products_with_cash_change_iva_and_stock_out` |
| CP-POS-03 | Sin stock se revierte toda la venta (RNF-04) | Producto sin existencias | 1. Vender | Rollback; nada se cobra | Rollback | ✅ | `PosTest › out_of_stock_rolls_back_the_whole_sale` |
| CP-POS-04 | El precio siempre sale del catálogo | — | 1. Enviar un precio alterado | Se cobra el precio del catálogo | Correcto | ✅ | `PosTest › the_price_always_comes_from_the_catalog` |
| CP-POS-05 | Descuento mayor al límite requiere autorización | Cajera con límite de descuento | 1. Aplicar un descuento mayor al límite | Se pide la clave de un superior | Correcto | ✅ | `PosTest › discount_above_the_limit_requires_a_superior_authorization` |
| CP-POS-06 | Entrega de equipo reparado cobra el saldo | Orden lista | 1. Entregar | Cobra el saldo y la marca como entregada | Correcto | ✅ | `PosTest › delivering_a_repaired_order_charges_the_balance_and_marks_it_delivered` |
| CP-CAJ-01 | Solo un turno abierto por caja | Turno abierto | 1. Abrir otro | Rechazado | Rechazado | ✅ | `Cash/CashShiftTest › a_register_can_only_have_one_open_shift` |
| CP-CAJ-02 | Corte con diferencia notifica al administrador | Turno con faltante | 1. Cerrar con un monto distinto | Se registra la diferencia y se avisa al admin | Correcto | ✅ | `CashShiftTest › closing_with_a_difference_notifies_the_admin` |
| CP-INV-01 | El stock nunca queda negativo | Producto con stock 1 | 1. Sacar 2 | Rechazado | Rechazado | ✅ | `Inventory/InventoryTest › stock_can_never_go_below_zero` |
| CP-INV-02 | Toda entrada queda en el kárdex | — | 1. Registrar entrada | Movimiento en `inventory_movements` | Correcto | ✅ | `InventoryTest › stock_in_adds_stock_and_writes_the_kardex` |

## 8. Portal del cliente y chat (MVP prioridad 4)

| ID | Descripción | Precondiciones | Pasos | Resultado esperado | Resultado obtenido | Estado | Evidencia |
|---|---|---|---|---|---|---|---|
| CP-POR-01 | Primer acceso con contraseña temporal obliga a crear una propia | Cliente recién registrado | 1. Entrar con la temporal | Se le pide crear su contraseña | Correcto | ✅ | `Auth/CustomerAuthTest › customer_logs_in_with_temporary_password_and_must_change_it` |
| CP-POR-02 | El cliente solo ve sus órdenes | Dos clientes | 1. Listar órdenes | Solo las suyas | Correcto | ✅ | `Portal/PortalTest › customer_sees_only_her_own_orders` |
| CP-CHT-01 | El cliente escribe y el jefe recibe aviso | Orden del cliente | 1. Enviar mensaje | Notificación al jefe | Correcto | ✅ | `Chat/ChatTest › customer_writes_about_her_order_and_the_head_is_notified` |
| CP-CHT-02 | Los mensajes no se editan ni se borran | Mensaje enviado | 1. Intentar editar o borrar | Rechazado | Rechazado | ✅ | `ChatTest › messages_cannot_be_edited_or_deleted` |

## 9. Interfaz y flujos en el navegador (E2E)

| ID | Descripción | Precondiciones | Pasos | Resultado esperado | Resultado obtenido | Estado | Evidencia |
|---|---|---|---|---|---|---|---|
| CP-E2E-01 | Cada rol llega a su módulo | Frontend + API + BD | 1. Entrar con `admin`, `jefe`, `carlos` y `sofia` | Cada uno ve su inicio y su menú | — | ⏳ | Playwright (Félix) |
| CP-E2E-02 | Venta completa desde el POS | Turno abierto | 1. Buscar producto → agregar → cobrar | Ticket y stock actualizado en la BD | — | ⏳ | Playwright |
| CP-E2E-03 | Orden de principio a fin | Usuarios de prueba | 1. Cajera recibe → jefe asigna → técnico diagnostica → cliente aprueba en el portal | El estado se ve igual en los cuatro roles | — | ⏳ | Playwright |
| CP-UI-01 | Diseño adaptativo (RNF-03) | — | 1. Revisar cada módulo en 360, 768, 1366 y 1920 px | Sin desbordes; igual a Figma | — | ⏳ | Revisión manual (Félix) |
| CP-UI-02 | Compilación del frontend | — | 1. `ng build` | Sin errores ni avisos | 0 errores, 0 avisos | ✅ | Ejecución del 24 nov sobre `31ca27e` |

---

## Resumen

| Módulo | Casos | ✅ | ⏳ |
|---|---|---|---|
| Autenticación del personal | 9 | 9 | 0 |
| MFA | 7 | 6 | 1 |
| Multisesión | 6 | 5 | 1 |
| Recuperación de contraseña | 7 | 6 | 1 |
| Control de acceso y seguridad | 11 | 7 | 4 |
| Taller | 9 | 9 | 0 |
| Caja, POS e inventario | 10 | 10 | 0 |
| Portal y chat | 4 | 4 | 0 |
| Interfaz y E2E | 5 | 1 | 4 |
| **Total** | **68** | **57** | **11** |

Los 11 casos pendientes dependen de las pruebas E2E (Félix) y de las pruebas de seguridad faltantes (Brisa), según el calendario del [plan de pruebas](plan-de-pruebas.md#11-calendario).
