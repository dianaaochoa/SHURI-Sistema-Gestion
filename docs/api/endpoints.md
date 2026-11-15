# 🔌 API REST de SHURI · Guía de endpoints

Referencia para conectar el frontend (Angular) con el backend (Laravel). Cada sección indica la **pantalla de Figma**, **quién** puede usar el endpoint, **qué se envía** y **qué responde**.

## Índice

1. [Conexión y convenciones](#1-conexión-y-convenciones)
2. [Recorrido completo del MVP](#2-recorrido-completo-del-mvp)
3. [Acceso del personal (A.1–A.6)](#3-acceso-del-personal-a1a6)
4. [Acceso al portal del cliente (P1)](#4-acceso-al-portal-del-cliente-p1)
5. [Recepción y clientes (C4, C5, C8)](#5-recepción-y-clientes-c4-c5-c8)
6. [Asignación y tablero del jefe (J1, J2, J7)](#6-asignación-y-tablero-del-jefe-j1-j2-j7)
7. [Banco del técnico (T2, T3)](#7-banco-del-técnico-t2-t3)
8. [Cotización y liberación (J3, J8)](#8-cotización-y-liberación-j3-j8)
9. [Inventario (C7, J6, AD4)](#9-inventario-c7-j6-ad4)
10. [Caja (C1, C10, AD3)](#10-caja-c1-c10-ad3)
11. [Punto de venta y entrega (C2, C3, C6)](#11-punto-de-venta-y-entrega-c2-c3-c6)
12. [Portal del cliente (P1, P2, P4)](#12-portal-del-cliente-p1-p2-p4)
13. [Usuarios y permisos (AD7)](#13-usuarios-y-permisos-ad7)
14. [Notificaciones (campanita)](#14-notificaciones-campanita)
15. [Refacciones del taller (T5, J5)](#15-refacciones-del-taller-t5-j5)
16. [Garantías (P3, C4, J4, T4)](#16-garantías-p3-c4-j4-t4)
17. [Chat cliente ↔ jefe (P5, J11)](#17-chat-cliente--jefe-p5-j11)
18. [Compras a proveedores (AD5, J5, C7)](#18-compras-a-proveedores-ad5-j5-c7)
19. [Resguardo y abandono (J9)](#19-resguardo-y-abandono-j9)

---

## 1. Conexión y convenciones

### URL base

```
http://localhost:8000/api/v1
```

En Angular conviene guardarla en `environment.ts` (`apiUrl`) y no escribirla en cada servicio.

### Autenticación

Todas las rutas, salvo el acceso, la recuperación de contraseña y `GET /portal/info`, piden el token que devuelve el login:

```
Authorization: Bearer <token>
Accept: application/json
```

Lo ideal es un **interceptor** de Angular que agregue el encabezado en cada petición y, si la respuesta es `401`, mande a la pantalla de iniciar sesión. El token **vence a las 8 horas**.

### Formato de errores

Todos los errores responden JSON en español:

```json
{ "message": "Texto para mostrar al usuario.", "code": "FORBIDDEN" }
```

Los errores de validación (`422`) traen además el detalle por campo, listo para mostrarlo debajo de cada input:

```json
{
  "message": "El campo correo es obligatorio.",
  "errors": { "email": ["El campo correo es obligatorio."] }
}
```

| HTTP | `code` | Qué significa | Qué hacer en Angular |
|---|---|---|---|
| 401 | `UNAUTHENTICATED` | Token vencido o inválido | Mandar a iniciar sesión |
| 401 | `ACCOUNT_INACTIVE` | El administrador desactivó la cuenta | Mandar a iniciar sesión con el mensaje |
| 403 | `FORBIDDEN` | El rol no tiene ese permiso | Ocultar la acción o mostrar el mensaje |
| 403 | `PASSWORD_CHANGE_REQUIRED` | Tiene contraseña temporal | Mandar a "Crea tu contraseña" (A.5) |
| 403 | `WRONG_ACCOUNT_TYPE` | Token de cliente en una ruta del personal (o al revés) | Mandar al acceso correcto |
| 404 | `NOT_FOUND` | No existe o no le pertenece | Mostrar el mensaje |
| 422 | — | Validación (ver `errors`) | Mostrar cada error en su campo |
| 422 | `INSUFFICIENT_STOCK` | No hay existencias suficientes | Mostrar el mensaje; trae `available` y `requested` |
| 423 | `ACCOUNT_LOCKED` | Cuenta bloqueada por intentos | Mostrar el mensaje; `unlock` dice si es por `time` o por el `admin` |
| 429 | `TOO_MANY_REQUESTS` | Demasiados intentos seguidos | Pedir que espere un momento |
| 503 | `MAIL_FAILED` | No se pudo enviar un correo | Mostrar el mensaje |

### Listas paginadas

Las listas responden con `data`, `links` y `meta` (formato de Laravel). Aceptan `?per_page=` (5 a 100) y `?page=`.

```json
{ "data": [ "…" ], "meta": { "current_page": 1, "last_page": 3, "total": 52 } }
```

### Fechas y dinero

- Las fechas con hora van en ISO 8601 con zona de México: `2026-11-11T09:02:11-06:00`. Las fechas sin hora, como `2026-11-20`.
- Los importes son números con 2 decimales, en pesos. Los precios al público **ya incluyen IVA**.

### Roles y permisos

| `role.slug` | Rol | Inicio en Angular |
|---|---|---|
| `admin` | Administrador | `/administrador/inicio` |
| `head_technician` | Jefe de técnicos | `/jefe/inicio` |
| `technician` | Técnico | `/tecnico/inicio` |
| `cashier` | Cajera | `/cajera/inicio` |

Los permisos de cada usuario llegan en `user.permissions` (por ejemplo `pos.sell`), así que el frontend puede mostrar u ocultar botones sin repetir las reglas. La matriz completa está en `GET /roles` ([sección 13](#13-usuarios-y-permisos-ad7)).

### Usuarios de prueba (solo en local)

| Usuario | Rol | Contraseña |
|---|---|---|
| `admin` | Administrador | `password` (clave de autorización: `password`) |
| `jefe` | Jefe de técnicos | `password` |
| `carlos`, `laura` | Técnicos | `password` |
| `sofia` | Cajera (Caja 01) | `password` |

Tienen MFA activo: con `MAIL_MAILER=log` el código aparece en `backend/storage/logs/laravel.log`.

---

## 2. Recorrido completo del MVP

El orden en que se usan los endpoints en la sucursal, de la recepción a la entrega:

| # | Quién | Pantalla | Endpoint | Estado de la orden |
|---|---|---|---|---|
| 1 | Cajera | C5 | `POST /service-orders` | Recibido |
| 2 | Jefe | J2 | `POST /service-orders/{folio}/assign` | Asignado |
| 3 | Técnico | T3 | `POST /my/orders/{folio}/start` | En diagnóstico |
| 4 | Técnico | T3 | `POST /my/orders/{folio}/diagnosis` | En cotización |
| 5 | Jefe | J3 | `POST /quotes/{folio}/send` | Presupuesto pendiente · 📧 al cliente |
| 6 | Cliente | P2 | `POST /portal/quotes/{folio}/approve` | En reparación |
| 7 | Jefe | J8 | `POST /service-orders/{folio}/release` | Listo para recoger · 📧 al cliente |
| 8 | Cajera | C6 | `POST /sales` (renglón `service_order`) | Entregado |

Si el técnico dice "sin reparación" en el paso 4, o el cliente rechaza en el paso 6, la orden queda lista para recogerse y la cajera cobra solo la revisión.

---

## 3. Acceso del personal (A.1–A.6)

### `POST /auth/login`

A.1 Iniciar sesión con **usuario o correo**.

**Envía:**

```json
{ "login": "sofia", "password": "MiClave2026", "device_name": "Caja 01" }
```

`device_name` es opcional; se muestra en "Mis sesiones".

**Respuesta `200` cuando aplica MFA** (lo normal): mostrar la pantalla para escribir el código.

```json
{
  "mfa_required": true,
  "challenge_id": "Xn3…(64 caracteres)",
  "expires_at": "2026-11-11T09:12:00-06:00",
  "email_hint": "c*****@shuri.mx",
  "message": "Te enviamos un código de 6 dígitos a c*****@shuri.mx."
}
```

**Respuesta `200` sin MFA:** la sesión queda abierta.

```json
{
  "mfa_required": false,
  "token": "12|aBc…",
  "token_type": "Bearer",
  "expires_at": "2026-11-11T17:02:00-06:00",
  "user": {
    "id": 5,
    "name": "Sofía Cajera",
    "username": "sofia",
    "email": "caja@shuri.mx",
    "phone": null,
    "role": { "slug": "cashier", "name": "Cajera" },
    "permissions": ["pos.sell", "pos.discount", "cash.shift", "orders.receive"],
    "max_discount_pct": 10,
    "cash_register_id": 1,
    "must_change_password": false,
    "is_locked": false,
    "has_security_question": true,
    "two_factor_enabled": true,
    "chat_available": true,
    "last_login_at": "2026-11-11T09:02:00-06:00"
  }
}
```

Si `user.must_change_password` es `true`, mandar a "Crea tu contraseña" (A.5).

**Errores:**
- `422` `errors.login`: "Usuario o contraseña incorrectos." (el mismo mensaje si el usuario no existe).
- `423` `ACCOUNT_LOCKED` con `unlock: "admin"`: "Tu cuenta está bloqueada por seguridad. Pide al administrador que la desbloquee." Pasa al tercer intento fallido.
- `429`: más de 5 intentos por minuto.

### `POST /auth/2fa/verify`

Segundo paso del acceso: el código de 6 dígitos que llegó por correo. Vence en 10 minutos.

**Envía:** `{ "challenge_id": "Xn3…", "code": "482913" }` (acepta `"482 913"` o `"482-913"`).

**Respuesta `200`:** igual que el login sin MFA (`token`, `expires_at`, `user`).

**Errores `422`:**
- `errors.code`: "El código no es correcto. Te quedan 4 intento(s)."
- `errors.challenge_id`: "El código venció o ya no es válido. Inicia sesión de nuevo." (después de 5 intentos también hay que volver a iniciar sesión).

### `POST /auth/2fa/resend`

Envía un código nuevo para el mismo `challenge_id`. Se puede pedir **una vez por minuto**.

**Envía:** `{ "challenge_id": "Xn3…" }` · **Responde:** `{ "message", "challenge_id", "expires_at", "email_hint" }`

### `GET /auth/me`

Datos del usuario con sesión abierta: `{ "data": { …mismo objeto que user… } }`. Sirve para recargar el menú y los permisos al refrescar la página.

### `POST /auth/logout`

Cierra la sesión actual. Responde `{ "message": "Sesión cerrada." }`.

### `PUT /auth/password`

A.4 / A.5 / C1.6: crear o cambiar la contraseña. **Cierra las demás sesiones.**

```json
{ "current_password": "Kt7mPq2xRb", "password": "NuevaClave2026", "password_confirmation": "NuevaClave2026" }
```

Reglas de la nueva contraseña: mínimo 8 caracteres, con mayúsculas, minúsculas y números, y distinta a la actual.

### `POST /auth/password/forgot` y `POST /auth/password/answer`

A.3 "¿Olvidaste tu contraseña?", con el flujo de Figma: **usuario → pregunta secreta → contraseña temporal por correo → crear contraseña**.

**Paso 1** `POST /auth/password/forgot` con `{ "login": "sofia" }`:

```json
{ "requires_answer": true, "recovery_id": "…(64 caracteres)", "security_question": "¿Cómo se llamaba tu primera mascota?" }
```

Si la cuenta no existe o no tiene pregunta, responde lo mismo en ambos casos (para no revelar qué cuentas existen):

```json
{ "requires_answer": false, "message": "No podemos recuperar esta cuenta en línea. Pide una contraseña temporal al administrador." }
```

**Paso 2** `POST /auth/password/answer` con `{ "recovery_id": "…", "answer": "Firulais" }`:

```json
{ "email_hint": "c*****@shuri.mx", "message": "Te enviamos una contraseña temporal a c*****@shuri.mx. Entra con ella y el sistema te pedirá crear tu nueva contraseña." }
```

No importan los acentos ni las mayúsculas en la respuesta. Después de 3 respuestas incorrectas, la recuperación se anula. La recuperación vence en 15 minutos.

### `GET /security-questions` y `PUT /auth/security-question`

Catálogo de preguntas (público): `{ "data": [ { "key": "first_pet", "text": "¿Cómo se llamaba tu primera mascota?" } ] }`

Configurar la propia (C1.6):

```json
{ "current_password": "MiClave2026", "question": "first_pet", "answer": "Firulais" }
```

### Mis sesiones: `GET /auth/sessions` · `DELETE /auth/sessions/{id}` · `DELETE /auth/sessions`

Lista de dispositivos con sesión abierta:

```json
{
  "data": [
    {
      "id": 31,
      "device_name": "Caja 01",
      "browser": "Chrome",
      "platform": "Windows",
      "ip_address": "189.203.10.4",
      "created_at": "2026-11-11T09:02:00-06:00",
      "last_used_at": "2026-11-11T11:40:00-06:00",
      "expires_at": "2026-11-11T17:02:00-06:00",
      "is_current": true
    }
  ]
}
```

`DELETE /auth/sessions/{id}` cierra una sesión; `DELETE /auth/sessions` cierra **todas menos la actual** y responde `{ "message", "closed": 2 }`.

---

## 4. Acceso al portal del cliente (P1)

Mismos endpoints que el personal, con el prefijo `/portal` y **el correo** como usuario. Los tokens del portal no sirven en las rutas del personal (y al revés).

| Endpoint | Igual que |
|---|---|
| `POST /portal/login` con `{ "email", "password", "device_name" }` | `POST /auth/login` (el cliente **no** usa MFA) |
| `GET /portal/me` · `POST /portal/logout` | `GET /auth/me` · `POST /auth/logout` |
| `PUT /portal/password` | `PUT /auth/password` |
| `POST /portal/password/forgot` con `{ "login": "<correo>" }` · `POST /portal/password/answer` | Recuperación del personal; si no tiene pregunta, el mensaje dice "Pide una contraseña temporal en la sucursal." |
| `PUT /portal/security-question` | `PUT /auth/security-question` |
| `GET` · `DELETE /portal/sessions[/{id}]` | Mis sesiones |

**Respuesta de `POST /portal/login`:**

```json
{
  "token": "15|xYz…",
  "token_type": "Bearer",
  "expires_at": "2026-11-11T17:00:00-06:00",
  "customer": {
    "id": 8,
    "name": "Ana",
    "last_name": "López",
    "email": "ana@correo.com",
    "phone": "8711112222",
    "must_change_password": true,
    "has_security_question": false,
    "last_login_at": "2026-11-11T09:00:00-06:00"
  }
}
```

La primera vez entra con la **contraseña temporal** de su hoja de recepción (vence en 72 h) y debe crear la suya con `PUT /portal/password` antes de ver sus equipos. El cliente se bloquea 15 minutos tras 5 intentos.

---

## 5. Recepción y clientes (C4, C5, C8)

### `GET /order-statuses`

Catálogo de estados con su color, para las etiquetas:

```json
{ "data": [ { "code": "received", "name": "Recibido en Sucursal", "color": "#2563EB", "portal_step": 1, "is_final": false } ] }
```

### `GET /customers?search=` · `GET /customers/{id}`

Permiso: `customers.manage` u `orders.receive`. Busca por nombre, teléfono o correo (mínimo 2 caracteres).

```json
{
  "data": [
    { "id": 8, "name": "Ana", "last_name": "López", "phone": "8711112222", "email": "ana@correo.com", "has_portal_password": true, "service_orders_count": 2 }
  ]
}
```

`GET /customers/{id}` incluye además `devices` (sus equipos), para elegir uno en C5.

### `POST /customers`

C8 alta de cliente (permiso `customers.manage`).

```json
{ "name": "Ana", "last_name": "López", "phone": "871 111 2222", "email": "ana@correo.com", "address": null, "city": "Torreón", "postal_code": "27000", "notes": null }
```

El **teléfono (10 dígitos) y el correo son obligatorios y únicos**: el correo es su usuario del portal.

### `POST /customers/{id}/temporary-password`

C8 "Contraseña temporal": genera una nueva para el portal y cierra sus sesiones.

```json
{ "message": "Contraseña temporal generada. Entrégala al cliente.", "email": "ana@correo.com", "temporary_password": "Kt7mPq2x", "expires_at": "2026-11-14T10:00:00-06:00" }
```

### `POST /service-orders`

C5 Nueva orden (permiso `orders.receive`). Acepta un **cliente existente o uno nuevo**, y un **equipo existente o uno nuevo**.

```json
{
  "customer": { "name": "Ana", "last_name": "López", "phone": "8711112222", "email": "ana@correo.com" },
  "device": { "type": "Celular", "brand": "Samsung", "model": "Galaxy A54", "serial_number": "356789104512345", "color": "Negro" },
  "reported_issue": "No enciende después de mojarse.",
  "received_accessories": "Funda",
  "physical_condition": "Pantalla con rayones",
  "intake_checklist": { "enciende": false, "pantalla": true },
  "device_pin": "1234",
  "priority": "high",
  "promised_date": "2026-11-20"
}
```

Con un cliente y un equipo que ya existen: `"customer_id": 8, "device": { "id": 14 }`.

`priority`: `low`, `normal`, `high` o `urgent`.

**Respuesta `201`:**

```json
{
  "message": "Orden OS-2026-00001 registrada.",
  "data": { "folio": "OS-2026-00001", "status": { "code": "received", "…": "…" }, "…": "…" },
  "portal_access": { "email": "ana@correo.com", "temporary_password": "Kt7mPq2x", "expires_at": "2026-11-14T10:00:00-06:00" },
  "email_sent": true
}
```

`portal_access` solo viene **una vez** y solo si el cliente aún no tiene contraseña propia: es para **imprimirla en la hoja de recepción** (C11). Si ya tiene contraseña, viene `null`. El cliente recibe un correo con el folio y su acceso.

> El **anticipo** todavía no se guarda aquí: se cobra en el punto de venta, ligado al turno de caja.

### `GET /service-orders` · `GET /service-orders/{folio}`

C4 lista y detalle (permisos de mostrador, jefe o administrador).

**Filtros:** `?search=` (folio, cliente, teléfono, equipo) · `?status=received` · `?technician_id=3` · `?unassigned=1` · `?active=1`

**Una orden:**

```json
{
  "id": 1,
  "folio": "OS-2026-00001",
  "status": { "code": "ready_for_pickup", "name": "Listo para Recoger", "color": "#16A34A", "portal_step": 5 },
  "priority": "normal",
  "customer": { "id": 8, "name": "Ana", "last_name": "López", "phone": "8711112222", "email": "ana@correo.com" },
  "device": { "id": 14, "type": "Celular", "brand": "Samsung", "model": "Galaxy A54", "serial_number": "3567…", "color": "Negro", "label": "Celular Samsung Galaxy A54" },
  "reported_issue": "No enciende después de mojarse.",
  "received_accessories": "Funda",
  "physical_condition": "Pantalla con rayones",
  "intake_checklist": null,
  "has_device_pin": true,
  "diagnosis": "Puerto de carga sulfatado.",
  "failure_cause": "Humedad",
  "labor_level_id": 3,
  "estimated_minutes": 60,
  "no_repair_reason": null,
  "technician": { "id": 3, "name": "Carlos Ruiz" },
  "received_by": "Sofía Cajera",
  "is_paused": false,
  "pause_reason": null,
  "estimated_cost": 1300,
  "deposit": 0,
  "total": 1300,
  "is_paid": false,
  "balance": { "work": 1300, "inspection_fee": 0, "storage_fee": 0, "deposit": 0, "amount_due": 1300 },
  "promised_date": "2026-11-20",
  "diagnosis_due_at": "2026-11-12T10:00:00-06:00",
  "created_at": "2026-11-11T10:00:00-06:00",
  "assigned_at": "2026-11-11T10:30:00-06:00",
  "ready_at": "2026-11-12T16:00:00-06:00",
  "delivered_at": null
}
```

- `device_pin` solo aparece para quien repara (permiso `orders.repair`); los demás solo ven `has_device_pin`.
- `balance` solo aparece cuando el equipo espera recolección y no se ha pagado: `amount_due` es **lo que la cajera debe cobrar** en C6.

---

## 6. Asignación y tablero del jefe (J1, J2, J7)

Permiso: `orders.assign` (jefe y administrador).

### `GET /workshop/board`

Contadores para J1 y J2:

```json
{
  "data": {
    "by_status": [ { "code": "received", "name": "Recibido en Sucursal", "color": "#2563EB", "total": 4 } ],
    "unassigned": 3,
    "urgent": 1,
    "diagnosis_overdue": 2
  }
}
```

### `GET /technicians`

Técnicos activos, **el menos ocupado primero** (modal de asignar en J2 y pantalla J7):

```json
{ "data": [ { "id": 3, "name": "Carlos Ruiz", "specialty": "iPhone", "active_orders": 2, "priority_orders": 1, "diagnosing": 1, "paused": 0 } ] }
```

### `POST /service-orders/{folio}/assign`

```json
{ "technician_id": 3, "priority": "urgent" }
```

La primera asignación pasa la orden a **Asignado**; reasignar durante el diagnóstico conserva la etapa. No se pueden asignar órdenes listas, entregadas o en abandono.

**Errores `422`:** "Solo puedes asignar la orden a un técnico activo." · "La orden ya está asignada a Carlos Ruiz."

---

## 7. Banco del técnico (T2, T3)

Permiso: `orders.repair` (técnicos y jefe). El técnico **solo ve y modifica las órdenes que tiene asignadas**: una ajena responde `404`.

### `GET /my/orders` · `GET /my/orders/{folio}`

T2 Mis equipos. Filtros: `?active=1` · `?status=diagnosing` · `?search=`. Cada orden trae el `device_pin`.

`GET /my/orders/{folio}` y todas las acciones del banco responden la orden y su **cronómetro**:

```json
{ "data": { "folio": "OS-2026-00001", "…": "…" }, "timer": { "running": true, "started_at": "2026-11-11T11:00:00-06:00", "worked_minutes": 45 } }
```

### `POST /my/orders/{folio}/start`

Botón "Iniciar": la primera vez pasa de **Asignado** a **En diagnóstico** y arranca el cronómetro.

**Error `422`:** "Ya estás trabajando en la orden OS-2026-00002. Páusala antes de iniciar otra." (un técnico no trabaja dos órdenes a la vez).

### `POST /my/orders/{folio}/pause` · `POST /my/orders/{folio}/resume`

Pausar con motivo (`{ "reason": "Falta el PIN del cliente" }`) o reanudar. La pausa **no cambia el estado**; solo detiene el cronómetro.

### `POST /my/orders/{folio}/diagnosis`

T3 Diagnóstico. Solo se puede mientras la orden está **En diagnóstico**.

Con reparación (pasa a **En cotización** y le llega al jefe en J3):

```json
{ "outcome": "repairable", "diagnosis": "Display dañado por golpe.", "failure_cause": "Golpe", "labor_level_id": 3, "estimated_minutes": 60 }
```

Sin reparación (pasa a **Sin reparación** y queda lista para devolverse):

```json
{ "outcome": "not_repairable", "diagnosis": "Placa con corto en el procesador.", "no_repair_reason": "No hay refacción de la placa." }
```

### `GET /labor-levels`

Niveles de mano de obra (permiso `orders.repair` u `orders.quote`):

```json
{ "data": [ { "id": 3, "name": "Medio", "typical_time": "Hasta 1 h 30", "examples": "Puerto de carga, conector de batería", "price": "580.00", "is_inspection": false } ] }
```

---

## 8. Cotización y liberación (J3, J8)

### Jefe (permiso `orders.quote`)

#### `GET /quotes/to-quote`

J3 Por cotizar: presupuestos que dejó el técnico, **urgentes primero**.

```json
{
  "data": [
    {
      "quote_id": 4, "quote_folio": "COT-2026-00004", "type": "initial", "is_urgent": 0,
      "service_order_id": 1, "folio": "OS-2026-00001", "customer": "Ana", "device": "Samsung Galaxy A54",
      "technician": "Carlos Ruiz", "diagnosis": "Display dañado por golpe.", "labor_level": "Medio",
      "estimated_minutes": 60, "priority": "normal", "sent_by_technician_at": "2026-11-11 12:00:00",
      "minutes_waiting": 35, "is_late": 0
    }
  ]
}
```

#### `GET /quotes/{folio}`

Detalle del presupuesto (mismo formato que la respuesta de enviar).

#### `POST /quotes/{folio}/send`

Cotizar y enviar al cliente. Refacciones y mano de obra **toman el precio del catálogo**; solo "otro concepto" lleva precio manual.

```json
{
  "items": [
    { "type": "part", "product_id": 12, "quantity": 1 },
    { "type": "labor", "labor_level_id": 3 },
    { "type": "other", "concept": "Mica de cristal templado", "unit_price": 100 }
  ],
  "discount": 100,
  "warranty_days": 30,
  "customer_note": "Incluye mica de regalo.",
  "estimated_delivery_date": "2026-11-15"
}
```

**Respuesta `200`:** la orden pasa a **Presupuesto pendiente** y el cliente recibe un correo.

```json
{
  "message": "Presupuesto COT-2026-00004 enviado al cliente.",
  "data": {
    "folio": "COT-2026-00004", "type": "initial", "status": "pending", "status_name": "Por aprobar",
    "diagnosis": "Display dañado por golpe.", "failure_cause": "Golpe",
    "labor_amount": 580, "parts_amount": 820, "discount": 100, "total": 1300,
    "warranty_days": 30, "valid_until": "2026-11-18", "estimated_delivery_date": "2026-11-15",
    "customer_note": "Incluye mica de regalo.", "customer_comment": null,
    "sent_at": "2026-11-11T12:40:00-06:00", "answered_at": null,
    "return_reason": null, "estimated_minutes": 60,
    "items": [
      { "type": "part", "concept": "Pantalla Galaxy A54", "quantity": 1, "unit_price": 720, "subtotal": 720, "out_of_stock": false, "unit_cost": 450 }
    ]
  }
}
```

`out_of_stock: true` avisa que la refacción no tiene existencias. `unit_cost` solo lo ve quien tiene `catalog.view_costs`.

#### `POST /quotes/{folio}/return`

Regresar al técnico para que revise el diagnóstico: `{ "reason": "Revisa también el flex de carga" }`. La orden vuelve a **En diagnóstico**; cuando el técnico diagnostica otra vez, se reutiliza el mismo presupuesto.

#### `POST /service-orders/{folio}/release`

J8 Liberar el equipo terminado: de **En reparación** a **Listo para recoger**. El cliente recibe el correo "Tu equipo está listo" y la respuesta trae la orden con su `balance.amount_due`.

### Cliente

Ver [sección 12](#12-portal-del-cliente-p1-p2-p4): `GET /portal/orders/{folio}/quote`, `POST /portal/quotes/{folio}/approve` y `/reject`.

---

## 9. Inventario (C7, J6, AD4)

| Endpoint | Permiso |
|---|---|
| `GET /categories`, `GET /products`, `GET /products/{id}`, `GET /inventory/movements` | `inventory.view` (todos los roles) |
| `POST /products` | `catalog.prices` o `inventory.stock_in` |
| `PUT /products/{id}` | `catalog.prices` (administrador) |
| `POST /inventory/stock-in` | `inventory.stock_in` |
| `POST /inventory/adjustments` | `inventory.adjust` |

### `GET /categories`

`{ "data": [ { "id": 1, "name": "Pantallas", "type": "part" } ] }` · `type`: `part` (refacción), `accessory` (accesorio) o `consumable` (consumible).

### `GET /products` · `GET /products/{id}`

**Filtros:** `?search=` (nombre, SKU, código de barras exacto, marca, compatible con) · `?category_id=` · `?type=part` · `?low_stock=1` · `?sellable=1` (se vende en mostrador) · `?workshop=1` (se usa en el taller)

```json
{
  "id": 12,
  "sku": "PAN-A54",
  "barcode": "7501234567890",
  "name": "Pantalla Galaxy A54",
  "brand": "Samsung",
  "compatible_with": "Galaxy A54",
  "description": null,
  "type": "part",
  "category": { "id": 1, "name": "Pantallas" },
  "sellable_at_counter": true,
  "usable_in_workshop": true,
  "sale_price": 720,
  "purchase_price": 450,
  "margin": 270,
  "stock": 3,
  "min_stock": 2,
  "is_low_stock": false,
  "location": "Estante A2",
  "is_active": true
}
```

`purchase_price` y `margin` solo aparecen con el permiso `catalog.view_costs`. `GET /products/{id}` trae además `recent_movements` (los últimos 10 del kardex).

### `POST /products` · `PUT /products/{id}`

```json
{
  "category_id": 6, "sku": "AUD-JBL-01", "barcode": "7501234567890", "name": "Audífonos JBL Tune 510",
  "brand": "JBL", "type": "accessory", "purchase_price": 520, "sale_price": 899,
  "min_stock": 2, "location": "Vitrina 1", "sellable_at_counter": true, "usable_in_workshop": false,
  "initial_stock": 5
}
```

- El SKU se guarda en mayúsculas. SKU y código de barras son únicos.
- `initial_stock` solo en el alta: entra al kardex como movimiento de entrada.
- En `PUT` todo es opcional, **el stock no se edita** (solo con entradas o ajustes), y se puede mandar `price_change_reason`: cada cambio de precio queda en el historial.

### `POST /inventory/stock-in`

C7.3 Entrada de mercancía: `{ "product_id": 12, "quantity": 7, "reason": "Compra de contado" }`

### `POST /inventory/adjustments`

C7.4 Ajuste por conteo físico: deja el stock **igual a lo contado**.

```json
{ "product_id": 12, "counted_stock": 8, "reason": "Conteo mensual: 2 piezas dañadas", "is_shrinkage": true }
```

Las dos responden `201`:

```json
{
  "message": "Inventario ajustado.",
  "movement": { "id": 40, "type": "shrinkage", "type_name": "Merma", "quantity": -2, "previous_stock": 10, "new_stock": 8, "reason": "…", "user": "Sofía Cajera", "created_at": "…" },
  "product": { "id": 12, "stock": 8, "…": "…" }
}
```

### `GET /inventory/movements`

C7.6 Kardex. Filtros: `?product_id=` · `?type=sale` · `?from=2026-11-01` · `?to=2026-11-30`

`type`: `stock_in` (Entrada), `adjustment` (Ajuste), `sale` (Venta), `workshop_use` (Uso en taller), `sale_return`, `workshop_return`, `supplier_return`, `shrinkage` (Merma). Cada movimiento trae `previous_stock` y `new_stock`; las ventas traen `sale_id` y el uso en taller `service_order_folio`.

> Cuando un producto **cruza su stock mínimo**, el administrador y el jefe reciben una notificación ([sección 14](#14-notificaciones-campanita)).

---

## 10. Caja (C1, C10, AD3)

| Endpoint | Permiso |
|---|---|
| `GET /cash-shifts/current`, `POST /cash-shifts` | `cash.shift` |
| `GET /cash-registers`, `GET /cash-shifts`, `GET /cash-shifts/{id}`, `POST /cash-shifts/{id}/close` | `cash.shift` o `cash.review_closing` |
| `POST /cash-shifts/{id}/movements` | `cash.withdrawal` |
| `POST /cash-shifts/{id}/review` | `cash.review_closing` (administrador) |

La cajera solo ve y opera **sus** turnos; el administrador ve todos y puede cerrar un turno olvidado.

### `GET /cash-registers`

`{ "data": [ { "id": 1, "name": "Caja 01", "location": "Mostrador principal", "default_opening_amount": "1000.00", "shifts": "Matutino · Vespertino" } ] }`

### `GET /cash-shifts/current`

C10.1 Mi turno abierto. Si no hay, responde `{ "data": null, "summary": null }` → mostrar "Abrir turno" (C1).

### `POST /cash-shifts`

C1 Abrir turno. Todo es opcional: por defecto usa la caja del usuario y su fondo.

```json
{ "cash_register_id": 1, "shift": "morning", "opening_amount": 1000 }
```

**Error `422`:** "La Caja 01 ya tiene un turno abierto por Sofía." · "Ya tienes un turno abierto. Ciérralo antes de abrir otro."

Todas las respuestas de caja traen el turno y su **resumen en vivo**:

```json
{
  "data": {
    "id": 7, "folio": null, "status": "open", "status_name": "Abierto", "shift": "morning", "shift_name": "Matutino",
    "cash_register": { "id": 1, "name": "Caja 01" }, "cashier": { "id": 5, "name": "Sofía" },
    "opened_at": "2026-11-11T09:00:00-06:00", "opening_amount": 1000,
    "closed_at": null, "expected_cash": null, "counted_cash": null, "difference": null,
    "card_total": null, "transfer_total": null, "cash_left": null, "cash_handed_over": null,
    "closing_notes": null, "reviewed_by": null, "reviewed_at": null, "review_comment": null,
    "movements": [ { "id": 3, "folio": "RET-2026-00003", "type": "cash_out", "type_name": "Retiro", "amount": 200, "reason": "Depósito", "cash_before": 2300, "cash_after": 2100, "created_at": "…" } ]
  },
  "summary": {
    "opening_amount": 1000, "cash_sales": 1300, "card_sales": 900, "transfer_sales": 0,
    "cash_in": 0, "cash_out": 200, "cash_refunds": 0, "cash_supplier_payments": 0,
    "expected_cash": 2100
  }
}
```

### `POST /cash-shifts/{id}/movements`

C10.2 Retiro o ingreso de efectivo:

```json
{ "type": "cash_out", "amount": 200, "reason": "Depósito al banco" }
```

`type`: `cash_out` (retiro, lleva folio `RET-…`) o `cash_in` (ingreso). **Error `422`:** "No puedes retirar $600.00: en caja hay $500.00."

### `POST /cash-shifts/{id}/close`

C10.4 Corte de caja:

```json
{ "counted_cash": 2100, "cash_left": 1000, "closing_notes": null }
```

Guarda el efectivo esperado, lo contado, la diferencia y lo que se entrega (`cash_handed_over = counted_cash − cash_left`). El corte lleva folio `CC-…`. Si hay diferencia, el mensaje lo dice ("…con faltante de $50.00. Se avisó al administrador.") y el administrador recibe una notificación.

### `POST /cash-shifts/{id}/review`

AD3: el administrador revisa un corte cerrado: `{ "comment": "Faltante descontado de nómina" }`. El turno pasa a `reviewed`.

### `GET /cash-shifts` · `GET /cash-shifts/{id}`

C10.5 / AD3 historial. Filtros: `?status=closed` · `?user_id=` (solo el administrador) · `?with_difference=1`

---

## 11. Punto de venta y entrega (C2, C3, C6)

Permiso: `pos.sell`. **Hace falta un turno de caja abierto.**

### `POST /sales`

C2 Cobrar el ticket y C6 Entregar equipos. Un solo endpoint para todo: si algo falla (sin existencias, pagos incompletos), **no se guarda nada**.

```json
{
  "customer_id": null,
  "items": [
    { "type": "product", "product_id": 21, "quantity": 2, "discount_pct": 10 },
    { "type": "service_order", "folio": "OS-2026-00001", "picked_up_by_name": "Ana López" }
  ],
  "payments": [
    { "method": "cash", "amount": 1500, "amount_received": 2000 },
    { "method": "card", "amount": 1418.2, "card_last4": "4242" }
  ],
  "authorization": { "username": "admin", "code": "password" }
}
```

- **Productos:** el precio sale del catálogo (no se envía). `discount_pct` es opcional.
- **Órdenes de taller:** se cobra su `balance.amount_due`. La orden queda pagada y pasa a **Entregado**; se calcula su garantía. Solo órdenes que esperan recolección y no están pagadas.
- **Garantías con costo extra:** `{ "type": "warranty", "folio": "GAR-2026-00001" }` cobra el `extra_cost` de una garantía terminada y la marca como **entregada** ([sección 16](#16-garantías-p3-c4-j4-t4)).
- **Pagos:** `cash`, `card` o `transfer`, y se pueden combinar. **Deben sumar exactamente el total.** En efectivo, `amount_received` calcula el cambio.
- **Descuento (RF-14):** si supera el máximo del usuario (`user.max_discount_pct`), hay que mandar `authorization` con el usuario y la **clave de autorización** de un superior. Sin ella responde `422` en `errors.authorization`.

**Respuesta `201` (ticket):**

```json
{
  "message": "Venta V-2026-00012 cobrada.",
  "data": {
    "id": 12, "folio": "V-2026-00012", "status": "paid", "cashier": "Sofía Cajera",
    "customer": { "id": 8, "name": "Ana López" }, "authorized_by": "Administrador Shuri",
    "subtotal": 2670.69, "discount": 155, "tax": 402.51, "total": 2918.2,
    "items": [
      { "type": "product", "description": "Audífonos JBL Tune 510", "product_id": 21, "service_order_id": null, "quantity": 2, "unit_price": 899, "discount_pct": 10, "discount_amount": 179.8, "subtotal": 1618.2 },
      { "type": "service_order", "description": "Orden OS-2026-00001 · Celular Samsung Galaxy A54", "product_id": null, "service_order_id": 1, "quantity": 1, "unit_price": 1300, "discount_pct": 0, "discount_amount": 0, "subtotal": 1300 }
    ],
    "payments": [
      { "method": "cash", "method_name": "Efectivo", "amount": 1500, "amount_received": 2000, "change_given": 500, "card_last4": null, "reference": null },
      { "method": "card", "method_name": "Tarjeta", "amount": 1418.2, "amount_received": null, "change_given": null, "card_last4": "4242", "reference": null }
    ],
    "change": 500,
    "paid_at": "2026-11-11T13:00:00-06:00",
    "created_at": "2026-11-11T13:00:00-06:00"
  }
}
```

Los precios incluyen IVA: `subtotal − discount + tax = total`.

**Errores comunes:**
- `422` `errors.cash_shift`: "Abre tu turno de caja antes de cobrar."
- `422` `code: INSUFFICIENT_STOCK`: "No hay existencias suficientes de «Cable USB-C»: hay 1 y se necesitan 3."
- `422` `errors.payments`: "Los pagos ($500.00) no cubren el total ($900.00)."
- `422` `errors.items.0.folio`: "La orden OS-2026-00003 está «En Diagnóstico» y no se puede entregar."

### `GET /sales` · `GET /sales/{folio}`

C3 Ventas y C11 reimprimir ticket. La cajera ve **sus** ventas; con `reports.view` se ven todas. Filtros: `?search=` (folio) · `?from=` · `?to=` · `?cash_shift_id=`

---

## 12. Portal del cliente (P1, P2, P4)

Token del **cliente** ([sección 4](#4-acceso-al-portal-del-cliente-p1)). Antes de crear su contraseña propia, estas rutas responden `403 PASSWORD_CHANGE_REQUIRED`. Un folio de otra persona responde `404`.

### `GET /portal/orders`

P1 Mis equipos (`?active=1` oculta los entregados):

```json
{
  "data": [
    {
      "folio": "OS-2026-00001",
      "device": "Celular Samsung Galaxy A54",
      "status": {
        "code": "quote_pending", "name": "Presupuesto Pendiente",
        "message": "Hemos determinado el diagnóstico de tu equipo. Por favor, revisa el desglose del costo y presiona 'Aprobar' para iniciar la reparación.",
        "color": "#F97316", "step": 3, "is_final": false
      },
      "technician": "Carlos",
      "received_at": "2026-11-11T10:00:00-06:00",
      "promised_date": "2026-11-20",
      "ready_at": null,
      "delivered_at": null,
      "is_paid": false,
      "amount_due": 0,
      "free_pickup_until": null,
      "abandonment_date": null,
      "warranty_until": null,
      "warranty_active": false,
      "has_pending_quote": true
    }
  ]
}
```

`amount_due` es lo que pagará al recoger (0 mientras no esté listo). Si `has_pending_quote` es `true`, mostrar el aviso de presupuesto por aprobar.

### `GET /portal/orders/{folio}`

P2 Seguimiento: lo mismo, más la falla, el diagnóstico, la **barra de avance** y la **línea de tiempo**:

```json
{
  "data": {
    "folio": "OS-2026-00001",
    "reported_issue": "Pantalla rota.",
    "diagnosis": "Display dañado por golpe.",
    "steps": [
      { "step": 1, "name": "Recibido", "done": true, "current": false },
      { "step": 2, "name": "En diagnóstico", "done": true, "current": false },
      { "step": 3, "name": "Presupuesto", "done": false, "current": true },
      { "step": 4, "name": "En reparación", "done": false, "current": false },
      { "step": 5, "name": "Listo para recoger", "done": false, "current": false },
      { "step": 6, "name": "Entregado", "done": false, "current": false }
    ],
    "timeline": [
      { "date": "2026-11-11T10:00:00-06:00", "description": "Equipo recibido en sucursal con folio OS-2026-00001.", "status": "Recibido en Sucursal", "color": "#2563EB" }
    ],
    "…": "…"
  }
}
```

La línea de tiempo solo trae lo visible para el cliente: nunca notas internas, PIN ni costos.

### `GET /portal/orders/{folio}/quote`

El presupuesto por aprobar (o el último respondido). Mismo formato que en la [sección 8](#8-cotización-y-liberación-j3-j8), **sin** `unit_cost`, `return_reason` ni `estimated_minutes`. Si no hay presupuesto todavía: `404` "Este equipo no tiene presupuesto todavía."

### `POST /portal/quotes/{folio}/approve` · `POST /portal/quotes/{folio}/reject`

RF-07: aprobar o rechazar, con comentario opcional: `{ "comment": "Adelante, gracias" }`

- Aprobar: la orden pasa a **En reparación**.
- Rechazar: la orden queda lista para recogerse y se cobra solo la revisión.

**Errores `422` `errors.status`:** "Este presupuesto ya fue respondido." · "El presupuesto venció. Comunícate con la sucursal para pedir uno nuevo."

### `GET /portal/info` (pública, sin token)

P4 Información de la sucursal:

```json
{
  "data": {
    "business_name": "Shuri", "address": "…", "phone": "5500000000", "email": "contacto@shuri.mx",
    "hours": "Lun-Vie 10:00-19:00 / Sáb 10:00-14:00",
    "pickup_grace_days": 7, "abandonment_days": 90,
    "service_terms": "1. El cliente cuenta con 7 días naturales…", "privacy_notice": "…"
  }
}
```

---

## 13. Usuarios y permisos (AD7)

Requisitos: RF-01, RF-14. Todas las rutas piden el permiso **`users.manage`** (administrador).

### `GET /users`

Lista de empleados (AD7.1).

**Filtros:** `?search=` (nombre, usuario o correo) · `?role=cashier` · `?active=1`

**Respuesta `200`:**

```json
{
  "data": [
    {
      "id": 5,
      "name": "Ana Martínez",
      "username": "amartinez",
      "email": "amartinez@shuri.mx",
      "phone": "8715551234",
      "role": { "id": 4, "slug": "cashier", "name": "Cajera" },
      "cash_register": { "id": 1, "name": "Caja 01" },
      "specialty": null,
      "shift": "morning",
      "start_time": "09:00",
      "end_time": "15:00",
      "max_discount_pct": 10,
      "has_authorization_code": false,
      "two_factor_enabled": true,
      "is_active": true,
      "is_locked": false,
      "must_change_password": true,
      "last_login_at": "2026-11-11T09:02:11-06:00",
      "created_at": "2026-11-10T18:20:00-06:00"
    }
  ],
  "meta": { "current_page": 1, "total": 5 }
}
```

### `GET /users/{id}`

Un empleado, con los mismos campos.

### `POST /users`

Alta de un empleado (AD7.2). El sistema genera una **contraseña temporal**, la manda por correo y la devuelve **una sola vez** para entregarla en persona si el correo no llega. Al entrar, el empleado debe crear la suya (A.5).

**Envía:**

```json
{
  "name": "Ana Martínez",
  "username": "amartinez",
  "email": "amartinez@shuri.mx",
  "role_id": 4,
  "cash_register_id": 1,
  "phone": "8715551234",
  "specialty": null,
  "shift": "morning",
  "start_time": "09:00",
  "end_time": "15:00",
  "max_discount_pct": 10,
  "authorization_code": null,
  "two_factor_enabled": true
}
```

| Campo | Obligatorio | Reglas |
|---|---|---|
| `name` | Sí | Hasta 150 caracteres |
| `username` | Sí | 3 a 40 caracteres: minúsculas, números, `.`, `-`, `_`. Único. Se guarda en minúsculas. |
| `email` | Sí | Correo válido y único |
| `role_id` | Sí | Ver `GET /roles` (1 admin · 2 jefe · 3 técnico · 4 cajera) |
| `cash_register_id` | No | Caja de la cajera |
| `shift` | No | `morning`, `evening` o `full_day` |
| `start_time`, `end_time` | No | Formato `HH:mm` |
| `max_discount_pct` | No | 0 a 100. **Si no es administrador, máximo 20 %** (setting `max_discount_cap_pct`, RF-14) |
| `authorization_code` | No | Clave para autorizar descuentos de otros (mínimo 4 caracteres). Se guarda cifrada. |
| `two_factor_enabled` | No | Pedir código por correo al entrar (MFA). Por defecto `true`. |

**Respuesta `201`:**

```json
{
  "message": "Usuario amartinez creado. Debe cambiar su contraseña al entrar.",
  "data": { "id": 5, "username": "amartinez", "must_change_password": true, "…": "…" },
  "temporary_password": "Kt7mPq2xRb",
  "email_sent": true
}
```

### `PUT /users/{id}`

Edición. Todos los campos son opcionales; solo se cambian los que se envían. La contraseña **no** se edita aquí: se usa `POST /users/{id}/temporary-password`.

**Errores `422`:**
- `role_id`: "No puedes cambiar tu propio rol." · "No puedes quitar el rol al único administrador activo."
- `max_discount_pct`: "El descuento máximo no puede pasar del 20% (solo el administrador puede tener más)."

### `POST /users/{id}/deactivate`

Baja del empleado: ya no puede entrar y **se cierran todas sus sesiones al instante**.

**Errores `422`:** "No puedes desactivar tu propia cuenta." · "No puedes desactivar al único administrador activo."

### `POST /users/{id}/activate`

Reactiva la cuenta.

### `POST /users/{id}/temporary-password`

AD7 "Asignar contraseña temporal": genera una nueva, la manda por correo, **desbloquea** la cuenta y **cierra sus sesiones**. Responde igual que el alta (`temporary_password`, `email_sent`).

### `POST /users/{id}/unlock`

Desbloquea una cuenta bloqueada por 3 intentos fallidos, sin cambiar su contraseña.

### `GET /users/{id}/sessions` · `DELETE /users/{id}/sessions` · `DELETE /users/{id}/sessions/{sessionId}`

Control de dispositivos: ver dónde tiene sesión abierta el empleado y cerrar una o todas. Mismo formato que "Mis sesiones" ([sección 3](#3-acceso-del-personal-a1a6)).

### `GET /roles`

Matriz de permisos (AD7.3): qué puede hacer cada rol y con qué límite.

**Respuesta `200`:**

```json
{
  "data": [
    {
      "id": 4,
      "slug": "cashier",
      "name": "Cajera",
      "description": "Recepción, entrega y punto de venta",
      "active_users": 2,
      "permissions": [
        { "code": "pos.sell", "name": "Cobrar en punto de venta", "module": "cash", "limit_pct": null, "scope": null },
        { "code": "pos.discount", "name": "Aplicar descuentos", "module": "cash", "limit_pct": 10, "scope": null }
      ]
    }
  ]
}
```

---

## 14. Notificaciones (campanita)

Todo el personal. Hoy se generan por **stock bajo** (para quien hace pedidos), por **cortes de caja con diferencia** (para el administrador) y por **refacciones pedidas** por un técnico (para el jefe).

### `GET /notifications`

Las no leídas primero (máximo 30):

```json
{
  "unread": 1,
  "data": [
    {
      "id": "9b2c…",
      "data": { "kind": "low_stock", "product_id": 12, "sku": "PAN-A54", "name": "Pantalla Galaxy A54", "stock": 1, "min_stock": 2, "message": "Quedan 1 de «Pantalla Galaxy A54» (mínimo 2)." },
      "read": false,
      "created_at": "2026-11-11T13:00:00-06:00"
    }
  ]
}
```

`data.kind`: `low_stock`, `cash_difference`, `part_requested`, `warranty_requested`, `customer_message`, `part_arrived` o `devices_abandoned`. Mostrar `data.message`.

### `POST /notifications/{id}/read` · `POST /notifications/read-all`

Marcar una o todas como leídas.

---

## 15. Refacciones del taller (T5, J5)

Requisito: RF-05. El técnico **pide** la pieza para una orden suya y **devuelve** lo que no usó (permiso `parts.request`); el jefe **entrega**, **rechaza** y **recibe devoluciones** (permiso `parts.handle`).

Al entregarla, la pieza **sale del stock** (kardex `workshop_use`) y queda **ligada a la orden**. Lo que se le cobra al cliente no cambia: es lo que aprobó en el presupuesto.

### Técnico

#### `POST /my/orders/{folio}/part-requests`

Pedir una pieza (T3/T5). Solo para órdenes asignadas al técnico que siguen en el taller (en diagnóstico, cotización o reparación).

Del catálogo:

```json
{ "product_id": 12, "quantity": 1, "urgency": "urgent", "notes": "El cliente ya aprobó" }
```

Si no está en el catálogo, se describe (el jefe elige la pieza al entregarla):

```json
{ "description": "Batería compatible iPhone 11 de alta capacidad", "quantity": 1 }
```

**Respuesta `201`** (el jefe recibe una notificación):

```json
{
  "message": "Solicitud SR-2026-00007 enviada al jefe de técnicos.",
  "data": {
    "folio": "SR-2026-00007",
    "status": "pending",
    "status_name": "Pendiente",
    "urgency": "urgent",
    "description": "Batería iPhone 11",
    "quantity": 1,
    "notes": "El cliente ya aprobó",
    "product": { "id": 12, "sku": "BAT-IP11", "name": "Batería iPhone 11", "stock": 3, "can_deliver": true },
    "service_order": { "folio": "OS-2026-00001" },
    "technician": "Carlos Ruiz",
    "handled_by": null,
    "handled_at": null,
    "rejection_reason": null,
    "created_at": "2026-11-12T10:00:00-06:00"
  }
}
```

`status`: `pending`, `delivered`, `rejected`, `cancelled` u `ordered` (pedida al proveedor).

#### `GET /my/part-requests?status=` · `POST /my/part-requests/{folio}/cancel`

T5 Mis solicitudes. Solo se pueden cancelar las que siguen `pending`.

#### `GET /my/order-parts` · `POST /my/order-parts/{id}/return`

Piezas que le entregaron y aún no devuelve:

```json
{ "data": [ { "id": 3, "service_order_folio": "OS-2026-00001", "product": { "id": 12, "sku": "BAT-IP11", "name": "Batería iPhone 11" }, "quantity": 2, "returned_quantity": 0, "unit_price": 550, "subtotal": 1100, "delivered_at": "…" } ] }
```

Devolver lo que no usó (`condition` opcional: `new`, `open` o `damaged`):

```json
{ "quantity": 1, "reason": "Solo hizo falta una", "condition": "new" }
```

**Error `422`:** "Solo puedes devolver 1 pieza(s) de esta refacción."

> `GET /my/orders/{folio}` ([sección 7](#7-banco-del-técnico-t2-t3)) trae además `parts`: las piezas entregadas para esa orden.

### Jefe

#### `GET /part-requests?status=pending`

J5 Solicitudes, **urgentes primero**. Mismo formato que arriba; `product.can_deliver` dice si hay existencias suficientes.

#### `POST /part-requests/{folio}/deliver`

Entregar la pieza. Si el técnico solo la describió, mandar la del catálogo: `{ "product_id": 12 }`.

**Errores `422`:** `INSUFFICIENT_STOCK` (no hay existencias; no cambia nada) · "Esta solicitud ya fue atendida." · "Elige la refacción del catálogo que vas a entregar."

#### `POST /part-requests/{folio}/reject`

`{ "reason": "Usa la batería del cliente" }`. El técnico ve el motivo en sus solicitudes.

#### `GET /part-returns?status=pending` · `POST /part-returns/{id}/receive`

Devoluciones por recibir y recibirlas:

```json
{ "condition": "new", "returns_to_stock": true }
```

Si la pieza está en buen estado, **regresa al stock** (kardex `workshop_return`). Una pieza `damaged` nunca regresa al stock.

---

## 16. Garantías (P3, C4, J4, T4)

Requisito: RF-11. Solo sobre una orden **entregada** con la garantía **vigente** (`warranty_until`), y solo **una garantía activa** por orden.

```
requested (portal) ──► received (mostrador) ──► in_review (técnico) ──► awaiting_ruling ──► dictamen del jefe:
   · covered            ──► in_repair ──► finished ──► delivered (sin costo)
   · covered_with_cost  ──► approved ──► el cliente acepta ──► in_repair ──► finished ──► se cobra en el POS ──► delivered
                                     └─► el cliente no acepta ──► rejected ──► delivered
   · not_covered        ──► rejected ──► delivered (se devuelve sin reparar)
```

Si la cajera la registra en mostrador, empieza ya como `received`. El cliente recibe un correo con el **dictamen** y otro cuando el equipo está **listo**.

**Una garantía:**

```json
{
  "folio": "GAR-2026-00001",
  "status": "approved",
  "status_name": "Procede con costo · espera respuesta",
  "request_channel": "portal",
  "customer_reason": "La pantalla dejó de responder al tacto.",
  "service_order": { "folio": "OS-2026-00001", "device": "Celular Samsung Galaxy A54", "warranty_until": "2026-12-06" },
  "technician": "Carlos Ruiz",
  "technician_review": "El digitalizador falla en la esquina…",
  "ruling": "covered_with_cost",
  "ruling_name": "Procede con costo",
  "ruling_reason": "Además hay un golpe nuevo en el marco.",
  "extra_cost": 250,
  "extra_cost_accepted": null,
  "received_at": "…", "ruled_at": "…", "answered_at": null, "finished_at": null, "delivered_at": null,
  "created_at": "…"
}
```

`technician_review` (el reporte técnico interno) **no** se le muestra al cliente.

### Cliente (portal)

| Endpoint | Para qué |
|---|---|
| `POST /portal/orders/{folio}/warranty` con `{ "reason": "…" }` | P3 Solicitar la garantía |
| `GET /portal/orders/{folio}/warranty` | Ver la garantía más reciente de la orden |
| `POST /portal/warranties/{folio}/answer` con `{ "accept": true }` | Aceptar o rechazar el costo extra |

**Errores `422`:** "La garantía de esta orden no está vigente." · "Esta orden ya tiene una garantía en proceso."

### Mostrador (permiso `orders.receive` / `orders.deliver`)

| Endpoint | Para qué |
|---|---|
| `POST /service-orders/{folio}/warranties` con `{ "reason": "…" }` | C4 Registrar la garantía en mostrador (queda `received`) |
| `POST /warranties/{folio}/receive` | Recibir el equipo de una garantía pedida en el portal |
| `POST /warranties/{folio}/deliver` | Entregar **sin costo** (`finished` sin costo extra, o `rejected`) |
| `POST /sales` con `{ "type": "warranty", "folio": "GAR-…" }` | Cobrar el costo extra y entregar ([sección 11](#11-punto-de-venta-y-entrega-c2-c3-c6)) |
| `GET /warranties?status=` · `GET /warranties/{folio}` | Lista y detalle |

### Jefe (permiso `warranties.rule`)

| Endpoint | Para qué |
|---|---|
| `POST /warranties/{folio}/assign` con `{ "technician_id": 3 }` | Mandar a revisión (por defecto, el técnico que hizo la reparación) |
| `POST /warranties/{folio}/rule` | J4 Dictamen |

```json
{ "ruling": "covered_with_cost", "reason": "Además hay un golpe nuevo en el marco.", "extra_cost": 250 }
```

`ruling`: `covered` (procede), `not_covered` (no procede) o `covered_with_cost` (procede con costo; `extra_cost` obligatorio).

### Técnico (permiso `orders.repair`)

| Endpoint | Para qué |
|---|---|
| `GET /my/warranties` | T4 Garantías asignadas |
| `POST /my/warranties/{folio}/review` con `{ "report": "…" }` | Reporte de la revisión (pasa a `awaiting_ruling`) |
| `POST /my/warranties/{folio}/finish` | Terminar la reparación (pasa a `finished`) |

---

## 17. Chat cliente ↔ jefe (P5, J11)

Requisito: RF-12. Los mensajes **no se editan ni se borran** (los protegen triggers de la base de datos). Al leer una conversación, se marcan como leídos los mensajes del otro lado.

**Un mensaje:**

```json
{
  "id": 41,
  "sender": "staff",
  "author": "Jorge",
  "mine": false,
  "type": "text",
  "body": "La pieza llega mañana.",
  "read_at": null,
  "created_at": "2026-11-13T10:05:00-06:00"
}
```

- `sender`: `customer`, `staff` o `system`.
- `mine` dice si lo escribió quien está leyendo: sirve para pintarlo a la derecha.
- Al cliente se le muestra solo el **nombre de pila** de quien responde; al personal, el nombre completo.

### Cliente (portal)

#### `GET /portal/chat`

P5 Mis conversaciones y si hay quien responda:

```json
{
  "availability": { "available": false, "message": "Hoy estoy en capacitación; te respondo mañana temprano.", "until": "2026-11-13T19:00:00-06:00" },
  "data": [ { "id": 7, "status": "open", "service_order_folio": "OS-2026-00001", "unread": 1, "last_message_at": "…" } ]
}
```

Si `availability.available` es `false`, mostrar `availability.message` arriba del chat (RF-12: "si el jefe se marcó no disponible hoy, el portal se lo indica").

#### `POST /portal/chat`

Escribir sobre un equipo (`folio`) o en general (sin `folio`). Si ya hay una conversación abierta de ese equipo, el mensaje se agrega ahí.

```json
{ "body": "¿Ya tienen la pieza de mi equipo?", "folio": "OS-2026-00001" }
```

**Respuesta `201`:** `{ "availability", "conversation_id", "data": [ …mensajes… ] }`. El jefe recibe una notificación.

#### `GET /portal/chat/{id}/messages` · `POST /portal/chat/{id}/messages`

Leer la conversación (marca como leídas las respuestas) y responder con `{ "body": "…" }`. Una conversación de otra persona responde `404`. Si estaba cerrada, se **reabre** sola al escribir.

### Jefe (permiso `chat.reply`)

#### `GET /conversations?status=open&awaiting=1`

J11 Bandeja, primero las que esperan respuesta:

```json
{
  "awaiting_reply": 3,
  "data": [
    {
      "id": 7,
      "status": "open",
      "awaiting_reply": true,
      "unread": 2,
      "customer": { "id": 8, "name": "Ana López" },
      "service_order_folio": "OS-2026-00001",
      "device": "Apple iPhone 12",
      "last_message": "¿Para cuándo estaría?",
      "last_message_at": "2026-11-13T09:58:00-06:00",
      "handled_by": null
    }
  ]
}
```

#### `GET /conversations/{id}/messages`

La conversación completa (marca como leídos los del cliente), con `conversation: { id, status, customer, phone, service_order_folio }`.

#### `POST /conversations/{id}/messages`

Responder. Con texto o con una respuesta rápida:

```json
{ "body": "La pieza llega mañana." }
```

```json
{ "quick_reply_id": 2 }
```

El cliente recibe un **correo** avisando que tiene respuesta.

#### `POST /conversations/{id}/close`

Cerrar la conversación. Se reabre sola si el cliente vuelve a escribir.

#### `GET /quick-replies`

`{ "data": [ { "id": 2, "title": "Pieza en camino", "body": "…" } ] }`

#### `PUT /chat/availability`

"No disponible hoy" (J11/J10):

```json
{ "available": false, "unavailable_until": "2026-11-13T19:00:00-06:00", "message": "Hoy estoy en capacitación; te respondo mañana temprano." }
```

Sin `unavailable_until`, vale hasta el final del día. Para volver: `{ "available": true }`.

---

## 18. Compras a proveedores (AD5, J5, C7)

Requisito: RF-15. Hay dos documentos:

- **Pedido** (`PP-2026-00001`): lo que se le pide al proveedor. Junta las solicitudes de refacción sin stock del taller y renglones a mano.
- **Compra** (`C-2026-00001`): la mercancía que llega con su factura. **Sube el stock** y queda como cuenta por pagar.

Flujo: el jefe crea el pedido (`draft`) → lo envía (`sent`; las solicitudes pasan a `ordered`) → caja recibe la mercancía (`partially_received` / `received`; las solicitudes vuelven a `pending` y el técnico recibe la notificación `part_arrived`) → el jefe entrega la pieza (sección 15) → el admin paga la compra.

| Quién | Permiso | Puede |
|---|---|---|
| Admin | `suppliers.manage` | Proveedores, ver compras, pagar |
| Jefe y admin | `purchasing.orders` | Crear, enviar y cancelar pedidos |
| Caja, jefe y admin | `inventory.stock_in` | Recibir pedidos y registrar compras directas |

### Proveedores

#### `GET /suppliers?search=`

```json
{
  "data": [
    { "id": 1, "name": "Refacciones del Norte", "contact_name": "Luis", "phone": "8711234567", "email": null, "rfc": null, "credit_days": 15, "notes": null, "is_active": true, "debt": 600 }
  ]
}
```

`debt` es lo que se le debe (compras sin pagar). Lo pueden ver los tres permisos de la tabla, para elegir el proveedor en los formularios.

#### `POST /suppliers` · `PUT /suppliers/{id}` (`suppliers.manage`)

```json
{ "name": "Partes Express", "contact_name": "Ana", "phone": "8719876543", "email": "ventas@partes.mx", "rfc": "PEX010101AB1", "credit_days": 30, "notes": null }
```

El nombre es único. En `PUT` todos los campos son opcionales. `{ "is_active": false }` lo da de baja: ya no se le pueden hacer pedidos.

### Pedidos (J5)

**Un pedido:**

```json
{
  "folio": "PP-2026-00001",
  "status": "sent",
  "status_name": "Enviado",
  "supplier": { "id": 1, "name": "Refacciones del Norte" },
  "supplier_folio": "RN-778",
  "expected_date": "2026-11-15",
  "payment_terms": "cash_on_delivery",
  "receive_at": "counter",
  "notify_technician": true,
  "estimated_total": 1320,
  "notes": null,
  "items": [
    { "id": 5, "product_id": 18, "description": "Pantalla Samsung A52", "quantity": 2, "received_quantity": 1, "pending_quantity": 1, "unit_cost": 600, "part_request_id": 3, "service_order_id": 1 }
  ],
  "created_at": "…"
}
```

`status`: `draft`, `sent`, `partially_received`, `received` o `cancelled`.

#### `GET /purchase-orders?status=` · `GET /purchase-orders/{folio}`

Lista paginada (30) y detalle.

#### `POST /purchase-orders` (`purchasing.orders`)

```json
{
  "supplier_id": 1,
  "part_requests": ["SR-2026-00003"],
  "items": [ { "description": "Flex de carga genérico", "quantity": 3, "unit_cost": 40 } ],
  "expected_date": "2026-11-15",
  "payment_terms": "cash_on_delivery",
  "receive_at": "counter",
  "notify_technician": true,
  "notes": null
}
```

- `part_requests`: folios de solicitudes **pendientes** del taller. Cada una se vuelve un renglón con su producto, cantidad y costo.
- `items`: renglones a mano, con `product_id` o con `description` si la pieza todavía no está en el catálogo. Sin `unit_cost` se usa el costo del producto.
- Debe llevar al menos un renglón. El proveedor debe estar activo.
- `payment_terms`: `cash_on_delivery`, `transfer` o `credit`. `receive_at`: `counter` o `workshop`.

**Respuesta `201`:** el pedido en `draft`.

#### `POST /purchase-orders/{folio}/send`

`{ "supplier_folio": "RN-778" }` (opcional). Solo desde `draft`. Las solicitudes ligadas pasan a `ordered`.

#### `POST /purchase-orders/{folio}/cancel`

Solo desde `draft` o `sent`. Las solicitudes vuelven a `pending`.

#### `POST /purchase-orders/{folio}/receive` (`inventory.stock_in`)

Llegó la mercancía. Puede ser **parcial**.

```json
{
  "supplier_invoice": "FAC-1001",
  "tax": 0,
  "due_date": "2026-11-30",
  "notes": null,
  "items": [ { "item_id": 5, "quantity": 1, "unit_cost": 650 } ]
}
```

- `item_id` es el `id` del renglón del pedido. No se puede recibir más de `pending_quantity`.
- Si el renglón solo tenía descripción, hay que mandar `product_id` del catálogo para que entre al stock.
- Si `unit_cost` cambia, se actualiza el costo del producto y queda en el historial de precios (AD4).

**Respuesta `201`:**

```json
{
  "message": "Mercancía recibida en la compra C-2026-00001. El stock ya se actualizó.",
  "data": { …compra… },
  "purchase_order": { …pedido actualizado… }
}
```

### Compras y cuentas por pagar (C7, AD5)

**Una compra:**

```json
{
  "folio": "C-2026-00001",
  "supplier": { "id": 1, "name": "Refacciones del Norte" },
  "purchase_order_folio": "PP-2026-00001",
  "supplier_invoice": "FAC-1001",
  "purchase_date": "2026-11-13",
  "subtotal": 1200,
  "tax": 192,
  "total": 1392,
  "amount_paid": 400,
  "balance": 992,
  "payment_status": "partial",
  "due_date": "2026-11-30",
  "is_overdue": false,
  "notes": null,
  "items": [ { "product_id": 18, "product": "Pantalla Samsung A52", "quantity": 2, "unit_cost": 600, "subtotal": 1200 } ],
  "payments": [ { "method": "transfer", "amount": 400, "reference": "SPEI 123", "created_at": "…" } ]
}
```

`payment_status`: `pending`, `partial` o `paid`. `items` y `payments` solo vienen en el detalle.

#### `GET /purchases?payment_status=pending&supplier_id=` · `GET /purchases/{folio}`

Permisos `suppliers.manage` o `inventory.stock_in`. La lista está paginada (30), ordenada por fecha de vencimiento.

#### `POST /purchases` (`inventory.stock_in`)

C7 Entrada de mercancía con factura, **sin pedido** previo:

```json
{
  "supplier_id": 1,
  "supplier_invoice": "FAC-2002",
  "purchase_date": "2026-11-13",
  "tax": 192,
  "due_date": null,
  "notes": null,
  "items": [ { "product_id": 18, "quantity": 2, "unit_cost": 600 } ]
}
```

Sin `unit_cost` se usa el costo actual del producto. **Respuesta `201`:** la compra.

#### `POST /purchases/{folio}/payments` (`suppliers.manage`)

AD5 Pago al proveedor:

```json
{ "method": "transfer", "amount": 400, "reference": "SPEI 123" }
```

- `method`: `cash`, `card` o `transfer`.
- El monto no puede ser mayor que `balance`.
- En **efectivo** hace falta tener un turno de caja abierto: el pago sale de ese turno y se resta en el corte. Sin turno responde `422` en `method`.

**Respuesta `201`:** la compra actualizada, con `payments`.

---

## 19. Resguardo y abandono (J9)

Requisito: RF-09. Cuando la orden queda lista para recoger (o sin reparación, o con presupuesto rechazado), empieza a contar el resguardo:

| Días desde "listo" | `alert` | Qué pasa |
|---|---|---|
| 0 a 7 | `grace_period` | Sin costo |
| 8 a 82 | `charging` | Se cobra almacenaje ($10 por día extra). Se manda **un** correo al cliente avisando |
| 83 a 89 | `abandonment_notice` | Último aviso por correo, una sola vez |
| 90 o más | `abandon` | El proceso diario la pasa a **En Abandono** |

Los días y el monto salen de la configuración (`pickup_grace_days`, `storage_fee_amount`, `storage_fee_mode`, `abandonment_days`, `abandonment_notice_days`).

- El **almacenaje se suma solo** al saldo que cobra caja al entregar (sección 11) y al `amount_due` del portal.
- Al pasar a abandono, el almacenaje acumulado queda guardado en la orden.
- Un equipo en abandono **no se puede entregar**, solo mandar a desecho, salvo que `allow_delivery_when_abandoned` esté en `1`.
- Las acciones técnicas quedan bloqueadas (ya no aparece en el tablero ni en el banco del técnico).

El proceso diario corre solo a las 8:00 (`php artisan schedule:work` en desarrollo, o `php artisan shuri:process-storage` a mano). Cuando hay equipos nuevos en abandono, el jefe y el admin reciben la notificación `devices_abandoned`.

Permiso `orders.storage` (jefe y admin), salvo perdonar el almacenaje, que es `orders.waive_storage`.

#### `GET /storage?alert=`

J9 Equipos en resguardo. `alert`: `grace_period`, `charging`, `abandonment_notice`, `abandon` o `abandoned` (los que ya están en abandono). Sin filtro, vienen todos.

```json
{
  "summary": { "waiting": 12, "charging": 4, "about_to_be_abandoned": 1, "abandoned": 2 },
  "data": [
    {
      "folio": "OS-2026-00031",
      "customer": "Ana López",
      "phone": "8711234567",
      "status_code": "ready_for_pickup",
      "status": "Listo para Recoger",
      "location": "counter",
      "ready_at": "2026-11-03 12:00:00",
      "storage_days": 12,
      "free_until": "2026-11-10",
      "chargeable_days": 5,
      "storage_fee": 50,
      "storage_fee_waived": false,
      "abandonment_date": "2027-02-01",
      "days_until_abandonment": 78,
      "alert": "charging"
    }
  ]
}
```

`location`: `workshop`, `counter` o `storage` (bodega).

#### `POST /storage/process`

Corre ahora el proceso diario (útil para la demostración):

```json
{
  "message": "Proceso terminado: 1 equipo(s) pasaron a En Abandono.",
  "data": { "storage_fee_notices": 2, "abandonment_notices": 1, "abandoned": ["OS-2026-00004"] }
}
```

Correrlo varias veces no repite los correos.

#### `POST /service-orders/{folio}/send-to-storage`

Mandar el equipo a bodega (`location: storage`). Solo si espera a ser recogido o está en abandono.

#### `POST /service-orders/{folio}/dispose`

Desecho electrónico de un equipo **en abandono**: `{ "notes": "Entregado a reciclaje" }` (opcional). La orden pasa a `disposed`, que es un estado final.

**Respuesta (las tres acciones):**

```json
{
  "message": "…",
  "data": { "folio": "OS-2026-00004", "status_code": "disposed", "status": "Desechado", "location": "storage", "sent_to_storage_at": "…", "storage_fee": 880, "storage_fee_waived": false, "abandoned_at": "…", "disposed_at": "…" }
}
```

#### `POST /service-orders/{folio}/waive-storage` (`orders.waive_storage`)

Perdonar el almacenaje: `{ "reason": "Cliente hospitalizado" }` (obligatorio). Queda en la bitácora y en auditoría. Ya no se cobra al entregar.
