# Sprint 4 · 09 nov – 22 nov 2026 (en curso)

**Objetivo (README §7.6):** portal del cliente (aprobación de presupuestos, garantía, chat), correos automáticos, facturación, pruebas de integración y cierre.
**Ajuste del backend:** como la API se retrasó (R6), el backend prioriza en este orden: **(1) autenticación y seguridad, (2) MVP del taller, (3) POS y portal**.
**Responsables:** Félix, Diana, Brisa.

## Ceremonias

| Ceremonia | Fecha | Acuerdos |
|---|---|---|
| Sprint Planning | _Por completar (Diana)_ | Repriorización del backend: autenticación → MVP del taller → POS/portal |
| Dailies | _Por completar_ | _Por completar_ |
| Sprint Review | _22 nov · Por completar_ | _Por completar_ |
| Retrospectiva | _22 nov · Por completar_ | _Por completar_ |

## Planeado contra entregado (corte: 10 nov)

| Tarea | Responsable | Estado | Evidencia |
|---|---|---|---|
| Login del personal y del portal con Sanctum, bloqueo por intentos, RBAC con permisos | Brisa | ✅ | `b6ae240` |
| Multisesión: listado, cierre remoto y control de dispositivos | Brisa | ✅ | `43028df` |
| MFA con código por correo | Brisa | ✅ | `09cc463` |
| Recuperación de contraseña con pregunta secreta y contraseña temporal (flujo de Figma A.3) | Brisa | ✅ | `8e034da`, `9b9d50b` |
| Bloqueo tras 3 intentos con desbloqueo por el administrador (alineado al frontend) | Brisa | ✅ | `cfdf9aa` |
| Corrección: `migrate:fresh` fallaba por procedimiento duplicado | Brisa | ✅ | `82f6202` |
| Recepción de equipo con folio único y acceso temporal al portal (RF-03, MVP P1) | Brisa | 🔄 Lista, por hacer commit | — |
| Asignación a técnico (RF-04, MVP P2) | Brisa | ⏳ | — |
| Banco del técnico: diagnóstico y cambio de estado (RF-05, MVP P2) | Brisa | ⏳ | — |
| POS, caja, portal del cliente | Brisa / Félix | ⏳ | — |
| Integración del frontend con la API (`HttpClient` + interceptor) | Félix | ⏳ | — |
| Pull Request de `feature/backend` hacia `develop` | Brisa → Diana | ⏳ | — |
| _Otras tareas del equipo_ | _Diana / Félix_ | _Por completar_ | PR #6 y PR #7 (9 nov) |

**Pruebas automatizadas del backend:** 76 pruebas pasando en `cfdf9aa`, y 93 con la recepción.

**Rubros de la rúbrica cubiertos por el backend:** autenticación con usuario, contraseña, token y MFA; multisesiones; recuperación con 2 métodos (pregunta secreta y correo); rutas protegidas con middleware de autenticación, tipo de cuenta y permisos; patrones Repository, Observer y Singleton.

## Análisis de riesgos (backend)

| ID | Riesgo | P | G | Nivel | Cambio | Mitigación |
|---|---|:-:|:-:|:-:|:-:|---|
| R6 | Retraso del backend | 3 | 4 | 🟠 12 | ↓ | Autenticación completa en 2 días. Una funcionalidad por commit con pruebas. MVP del taller enseguida. |
| B1 | Frontend y backend sin integrarse | 4 | 4 | 🟠 16 | = | Se revisaron las vistas de Félix y se alinearon: recuperación igual a Figma A.3, 3 intentos, bloqueo por el administrador. Falta que el frontend consuma la API. |
| B2 | Migraciones no reproducibles | 1 | 3 | 🟢 3 | ↓ | **Se materializó y se corrigió** (`82f6202`). Las pruebas recrean la base completa en cada corrida. |
| B3 | `feature/backend` sin PR hacia `develop` | 4 | 3 | 🟠 12 | ↑ | Abrir el PR al terminar el MVP del taller para que Diana lo revise. |
| B4 | Sin servidor de correo, falla el MFA y los avisos | 3 | 3 | 🟡 9 | 🆕 | `MAIL_MAILER=log` en local. Cada envío queda en `sent_emails`. Si el correo falla, la orden no se pierde. |
| R3 | Filtración de datos o acceso no autorizado | 1 | 4 | 🟢 4 | ↓ | Implementado: Bcrypt, MFA, tokens con caducidad, rate limiting, bloqueo de cuenta, tokens de recuperación con hash, PIN cifrado y auditoría de accesos. |
| R7 | Estatus equivocado mostrado al cliente | 2 | 4 | 🟡 8 | ↓ | El Observer registra en la bitácora inmutable cada cambio de estado con su autor. |
| R12 | Existencias inconsistentes | 2 | 2 | 🟢 4 | = | Pendiente de implementar con el POS (kardex y `lockForUpdate`). |

## Retrospectiva del backend (parcial)

- **Qué salió bien:** el ritmo de un commit por funcionalidad, con pruebas automatizadas, permitió avanzar rápido sin romper lo anterior. La revisión de las vistas de Félix detectó diferencias antes de integrar.
- **Qué no salió bien:** las diferencias con el frontend (flujo de recuperación, número de intentos) se descubrieron después de programar, lo que obligó a hacer un `refactor`.
- **Acción:** revisar la pantalla de Figma y la vista de Angular **antes** de programar cada endpoint.
