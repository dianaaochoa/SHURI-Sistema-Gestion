# 🗓️ Registro de Sprints · SHURI

Evidencia de la aplicación de **Scrum** en cada sprint: objetivo, trabajo planeado contra lo entregado, ceremonias, Definition of Done y **análisis de riesgos actualizado** (probabilidad, gravedad y mitigación).

| Sprint | Fechas | Objetivo | Estado | Registro |
|---|---|---|---|---|
| 1 | 28 sep – 11 oct 2026 | Estructura del repositorio, base de datos y autenticación | Cerrado | [sprint-1.md](sprint-1.md) |
| 2 | 12 oct – 25 oct 2026 | Inventario, recepción/asignación y bitácora (MVP) | Cerrado | [sprint-2.md](sprint-2.md) |
| 3 | 26 oct – 08 nov 2026 | Punto de venta, caja, cotizaciones, garantías y compras | Cerrado | [sprint-3.md](sprint-3.md) |
| 4 | 09 nov – 22 nov 2026 | Portal del cliente, correos, facturación, pruebas y cierre | En curso | [sprint-4.md](sprint-4.md) |

## Roles Scrum

| Rol | Integrante |
|---|---|
| Product Owner | _Por completar (Diana)_ |
| Scrum Master | Diana Paola Ochoa Altamirano |
| Equipo de desarrollo | Diana Ochoa (arquitectura, QA) · Brisa Luna (backend y BD) · Félix Martínez (frontend y UX/UI) |

## Definition of Done (README §7.4)

1. El código entra a `develop` mediante un Pull Request aprobado por Diana.
2. Pasa las pruebas funcionales sin errores críticos (`php artisan test` y `ng build`).
3. La interfaz es adaptativa en móvil y escritorio.

**Criterios adicionales del backend** (aplicados desde el Sprint 4):

- Cada funcionalidad es un commit propio con Conventional Commits y su tarea/requisito (`T-xx`, `RF-xx`).
- Cada endpoint nuevo tiene pruebas de funcionalidad en `backend/tests/Feature/`.
- La migración se puede ejecutar desde cero (`php artisan migrate:fresh --seed`) sin errores.
- Ningún secreto en el repositorio: credenciales solo en `.env`.

## Escala de riesgos

Igual que el README §7.3: **Probabilidad (P)** y **Gravedad (G)** del 1 al 5. Nivel = P × G → 🟢 1–4 bajo · 🟡 5–9 moderado · 🟠 10–16 alto · 🔴 17–25 extremo.

> Cada sprint registra **cómo cambió** cada riesgo respecto al anterior (↑ subió, ↓ bajó, = igual, ✅ cerrado, 🆕 nuevo).
