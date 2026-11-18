# Sprint 3 · 26 oct – 08 nov 2026

**Objetivo (README §7.6):** punto de venta con liquidación de servicios, caja con cortes, cotizaciones, garantías y compras a proveedores.
**Responsables:** Félix, Brisa.

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
| T-01 Migraciones del modelo de datos (55 migraciones, nombres en inglés) | Brisa | Arrastrado del S1 | ✅ | `cde1353` (8 nov) |
| Modelos Eloquent con relaciones (51 modelos) | Brisa | Arrastrado | ✅ | `cde1353` |
| Vistas, triggers y procedimiento almacenado (flujo de estados, inmutabilidad de bitácoras) | Brisa | Arrastrado | ✅ | `cde1353` |
| Seeders de catálogos (roles, permisos por rol, estados, configuración, usuarios de prueba) | Brisa | Arrastrado | ✅ | `cde1353` |
| T-06/T-09 API de POS y caja | Félix / Brisa | Sí | ❌ Pendiente | — |
| T-10 API de garantías y compras | Brisa / Diana | Sí | ❌ Pendiente | — |
| Vistas de Cajera (C1–C11) y Jefe de técnicos (J1–J11) | Félix | Sí | ✅ (con datos de ejemplo) | Rama `feature/frontend-ui`, PR #6 |

**Velocidad del backend:** la base de datos quedó completa y funcional, pero ninguna API de este sprint.

## Análisis de riesgos (backend)

| ID | Riesgo | P | G | Nivel | Cambio | Mitigación |
|---|---|:-:|:-:|:-:|:-:|---|
| R6 | Retraso del backend | 4 | 4 | 🟠 16 | = | Plan para el Sprint 4: autenticación primero (la exige todo el sistema) y luego el MVP del taller, una funcionalidad por commit. |
| B1 | Frontend y backend avanzan sin integrarse | 4 | 4 | 🟠 16 | 🆕 | El frontend usa datos simulados. Mitigación: documentar el contrato de cada endpoint y adaptar el backend al prototipo de Figma. |
| B2 | Migraciones no reproducibles en otra máquina | 3 | 3 | 🟡 9 | 🆕 | Probar `migrate:fresh --seed` antes de cada commit. Se materializó en el Sprint 4 (ver `82f6202`). |
| B3 | Rama `feature/backend` sin Pull Request hacia `develop` | 3 | 3 | 🟡 9 | 🆕 | Abrir PR al cerrar cada bloque de funcionalidades. |
| R2 | Pérdida de la BD | 2 | 4 | 🟡 8 | = | Toda la estructura es reproducible con migraciones y seeders. |

## Retrospectiva del backend

- **Qué salió bien:** el modelo de 51 tablas quedó en migraciones con llaves foráneas, restricciones `CHECK`, columnas calculadas y triggers. Las reglas de integridad del README §15.2 se cumplen en la propia base de datos.
- **Qué no salió bien:** todo el trabajo se concentró al final del sprint, en un solo commit grande, y no hubo API.
- **Acción para el siguiente sprint:** commits pequeños por funcionalidad, cada uno con pruebas automatizadas.
