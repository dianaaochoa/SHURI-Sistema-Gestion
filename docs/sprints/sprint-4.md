# Sprint 4 · 09 nov – 28 nov 2026

**Objetivo (README §7.6):** portal del cliente (aprobación de presupuestos, garantía, chat), correos automáticos, facturación, pruebas de integración y cierre.
**Ajuste del backend:** como la API se retrasó (R6), el backend priorizó en este orden: **(1) autenticación y seguridad, (2) MVP del taller, (3) POS y portal**.
**Ajuste de fechas:** el cierre se movió del 22 al **28 de noviembre** para terminar la integración (milestone *Sprint 4* en GitHub).
**Responsables:** Félix, Diana, Brisa.
**Seguimiento:** tareas como Issues en GitHub, asignadas por Diana, agrupadas en el milestone *Sprint 4* (la #8 concentra la integración).

## Ceremonias

| Ceremonia | Fecha | Acuerdos |
|---|---|---|
| Sprint Planning | _Por completar (Diana)_ | Repriorización del backend: autenticación → MVP del taller → POS/portal |
| Dailies | _Por completar_ | _Por completar_ |
| Sprint Review | _Por completar_ | Revisión y combinación de los PR #9 y #10 (18 nov) y del PR #32 |
| Retrospectiva | _Por completar_ | _Por completar_ |

## Planeado contra entregado (corte: 26 nov)

| Tarea | Responsable | Estado | Evidencia |
|---|---|---|---|
| Login del personal y del portal con Sanctum, bloqueo por intentos y RBAC con permisos | Brisa | ✅ | PR #10 (`b6ae240`) |
| Multisesión: listado, cierre remoto y control de dispositivos | Brisa | ✅ | PR #10 (`43028df`) |
| MFA con código por correo | Brisa | ✅ | PR #10 (`09cc463`) |
| Recuperación de contraseña con pregunta secreta y contraseña temporal | Brisa | ✅ | PR #10 (`8e034da`, `9b9d50b`) |
| MVP del taller: recepción, asignación, banco del técnico, cotización y liberación | Brisa | ✅ | PR #10 |
| Inventario, caja, POS, garantías, refacciones, compras, chat, abandono y facturación (API) | Brisa | ✅ | PR #10 |
| Encabezados de seguridad OWASP y documentación de patrones, instalación y despliegue | Brisa | ✅ | PR #10 (`a47224c`, `540bffc`) |
| Módulos Técnico (T1–T7), Administrador (AD1–AD9) y Portal del cliente (P1–P6) | Félix | ✅ | PR #9 |
| Integración: cliente HTTP, interceptor del token y manejo de errores | Brisa | 🔄 En revisión | PR #32 (`5bb2578`) · Issue #31 |
| Integración: login con MFA, redirección por rol y pregunta secreta | Brisa | 🔄 En revisión | PR #32 (`87e0bee`) · Issue #30 |
| Rol de súper usuario | Brisa | 🔄 En revisión | PR #32 (`8873562`) |
| Preguntas de seguridad, nota de crédito, Excel, impresos y QR; limpieza y rendimiento | Félix | 🔄 En revisión | PR #32 |
| Resolución de conflictos entre las ramas de backend y frontend | Félix | 🔄 En revisión | PR #32 (`31ca27e`) · [BUG-07](../pruebas/registro-de-defectos.md#bug-07--conflictos-entre-las-ramas-de-backend-y-frontend-en-las-pantallas-de-acceso) |
| Integración: garantías (revisión, dictamen y reparación) | Brisa | 🔄 En su rama | `5482471` (23 nov) |
| Integración: Cajera, Jefe y Técnico, Administrador y Portal | Brisa | ⏳ | Issues #33, #34, #35 y #36 |
| Revisión y aprobación de PR, verificación de compilación y pruebas | Diana | ✅ | PR #9, #10; PR #32 verificado (269 pruebas, `ng build` sin avisos) |
| Seguimiento con Issues y milestones en GitHub | Diana | ✅ | Milestones Sprint 2–4, Issues #8 y #11–#36 |
| Plan de pruebas, casos de prueba, registro de defectos, proceso de liberación y CHANGELOG | Diana | ✅ | `docs/pruebas/`, `docs/release/`, `CHANGELOG.md` |

**Pruebas automatizadas del backend:** 269 pruebas aprobadas (1,449 verificaciones) en `31ca27e`.
**Commits en el sprint (9–22 nov):** Félix 47, Brisa 22.

**Rubros de la rúbrica cubiertos:** autenticación con usuario, contraseña, token y MFA; multisesiones; recuperación con 2 métodos (pregunta secreta y correo); rutas protegidas con middleware de autenticación, tipo de cuenta y permisos; patrones Repository, Observer y Singleton; encabezados OWASP.

## Análisis de riesgos (todo el equipo)

| ID | Riesgo | P | G | Nivel | Cambio | Mitigación |
|---|---|:-:|:-:|:-:|:-:|---|
| R6 | Retraso del backend | 2 | 4 | 🟡 8 | ↓ | **Se superó:** la API completa entró con el PR #10 (18 nov) con 257 pruebas. |
| B1 | Frontend y backend sin integrarse | 3 | 4 | 🟠 12 | ↓ | El acceso ya está conectado (PR #32). Falta conectar los módulos: Brisa tiene asignadas las Issues #33–#36. |
| B3 | Ramas sin Pull Request hacia `develop` | 2 | 3 | 🟡 6 | ↓ | Brisa y Félix abrieron sus PR (#10, #32). Diana revisa cada uno con compilación y pruebas antes de aprobar. |
| B5 | Conflictos al trabajar los mismos archivos en dos ramas | 3 | 4 | 🟠 12 | 🆕 | **Se materializó** en las pantallas de acceso y Félix lo resolvió ([BUG-07](../pruebas/registro-de-defectos.md#bug-07--conflictos-entre-las-ramas-de-backend-y-frontend-en-las-pantallas-de-acceso)). Desde ahora solo Brisa modifica las pantallas que está integrando. |
| B6 | `main` desactualizada respecto a `develop` | 4 | 3 | 🟠 12 | 🆕 | `main` no recibe cambios desde el 9 nov. Liberar `v0.3.0` (`develop` → `main`) al combinar el PR #32, con el checklist de [liberación](../release/proceso-de-release.md#3-checklist-de-liberación). |
| B4 | Sin servidor de correo, falla el MFA y los avisos | 3 | 3 | 🟡 9 | = | `MAIL_MAILER=log` en local; cada envío queda en `sent_emails`. Configurar un correo real al desplegar. |
| B7 | Sin pruebas del frontend, E2E ni integración continua | 4 | 3 | 🟠 12 | 🆕 | Plan de pruebas aprobado ([calendario](../pruebas/plan-de-pruebas.md#11-calendario)): GitHub Actions (Brisa), pruebas unitarias y E2E (Félix). |
| R3 | Filtración de datos o acceso no autorizado | 1 | 4 | 🟢 4 | = | Bcrypt, MFA, tokens con caducidad, rate limiting, bloqueo de cuenta, PIN cifrado, auditoría y encabezados OWASP. Faltan pruebas explícitas de SQLi, XSS, CSRF e IDOR (CP-SEG-08 a 10). |
| R7 | Estatus equivocado mostrado al cliente | 2 | 4 | 🟡 8 | = | El Observer registra cada cambio de estado con su autor en la bitácora inmutable. |
| R12 | Existencias inconsistentes | 1 | 2 | 🟢 2 | ↓ | Implementado: kárdex, `lockForUpdate` y stock nunca negativo (CP-INV-01). |

## Retrospectiva del backend (parcial)

- **Qué salió bien:** el ritmo de un commit por funcionalidad, con pruebas automatizadas, permitió avanzar rápido sin romper lo anterior. La revisión de las vistas de Félix detectó diferencias antes de integrar.
- **Qué no salió bien:** las diferencias con el frontend (flujo de recuperación, número de intentos) se descubrieron después de programar, lo que obligó a hacer un `refactor`.
- **Acción:** revisar la pantalla de Figma y la vista de Angular **antes** de programar cada endpoint.
