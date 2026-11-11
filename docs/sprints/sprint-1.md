# Sprint 1 · 28 sep – 11 oct 2026

**Objetivo (README §7.6):** estructura del repositorio, base de datos MySQL funcional, autenticación y permisos por rol (RBAC).
**Responsables:** Brisa, Diana.

## Ceremonias

| Ceremonia | Fecha | Acuerdos |
|---|---|---|
| Sprint Planning | _Por completar (Diana)_ | _Por completar_ |
| Dailies | _Por completar_ | _Por completar_ |
| Sprint Review | _Por completar_ | _Por completar_ |
| Retrospectiva | _Por completar_ | _Por completar_ |

## Planeado contra entregado

| Tarea | Responsable | Planeado | Entregado | Evidencia |
|---|---|---|---|---|
| Estructura Laravel 10 + Angular 17 | Diana | Sí | ✅ | `ca56f2b` (11 oct) |
| Ramas del flujo de trabajo | Diana | Sí | ✅ | `f12f73c` (13 oct, inicio del Sprint 2) |
| T-01 Esquema de BD (migraciones y seeders) | Brisa | Sí | ❌ Se movió al Sprint 3 | — |
| T-02 Autenticación con Sanctum y RBAC | Brisa / Diana | Sí | ❌ Se movió al Sprint 4 | — |
| _Frontend / diseño_ | _Félix_ | _Por completar_ | _Por completar_ | _Por completar_ |

**Velocidad del backend:** 0 de 2 tareas planeadas.

## Análisis de riesgos (backend)

| ID | Riesgo | P | G | Nivel | Cambio | Mitigación |
|---|---|:-:|:-:|:-:|:-:|---|
| R6 | Retraso en módulos críticos (BD y autenticación) | 3 | 4 | 🟠 12 | = | Priorizar el modelo de datos en el Sprint 2 antes de programar la API. |
| R2 | Pérdida o corrupción de la BD | 2 | 4 | 🟡 8 | = | La estructura se versionará con migraciones, no con respaldos `.sql` (bloque 2 del `.gitignore`). |
| R3 | Filtración de datos de clientes | 2 | 4 | 🟡 8 | = | Diseñar desde el inicio contraseñas con Bcrypt y tokens de Sanctum (RNF-01). |

## Retrospectiva del backend

- **Qué salió bien:** el repositorio y la estructura del proyecto quedaron listos a tiempo.
- **Qué no salió bien:** no se empezó el modelo de datos. Sin él no se podía programar la API, así que el retraso se arrastró a los sprints siguientes.
- **Acción para el siguiente sprint:** terminar el DER y el diccionario de datos antes de escribir migraciones.