# Sprint 2 · 12 oct – 25 oct 2026

**Objetivo (README §7.6):** inventario centralizado, panel de recepción/asignación del taller y bitácora del técnico (**MVP operativo**).
**Responsables:** Diana, Félix, Brisa.

## Ceremonias

| Ceremonia | Fecha | Acuerdos |
|---|---|---|
| Sprint Planning | _Por completar (Diana)_ | _Por completar_ |
| Dailies | _Por completar_ | _Por completar_ |
| Sprint Review | _Por completar_ | Entrega «avance Sprint 2» en `main` (`db037e6`, PR #4 y PR #5, 20 oct) |
| Retrospectiva | _Por completar_ | _Por completar_ |

## Planeado contra entregado

| Tarea | Responsable | Planeado | Entregado | Evidencia |
|---|---|---|---|---|
| Modelo de datos: DER (51 tablas en 7 módulos) | Brisa | Arrastrado del S1 | ✅ | `0c77dcb` (19 oct) |
| Diccionario de datos y reglas de integridad | Brisa | Arrastrado del S1 | ✅ | `0c77dcb`, `backend/README.md` §2 y §3 |
| `.gitignore` y protección de secretos | Brisa | Sí | ✅ | `0c77dcb` |
| T-03 API REST de inventario | Brisa | Sí | ❌ Pendiente | — |
| T-04/T-05 Recepción, asignación y bitácora (backend) | Brisa / Diana | Sí | ❌ Recepción en el Sprint 4 | — |
| Prototipo en Figma y casos de uso | Félix | Sí | ✅ | `docs/diseno/` (19 oct) |
| Documentación de las Unidades 1 y 2 | Diana | Sí | ✅ | PR #4, PR #5 |

**Velocidad del backend:** se entregó el modelo de datos (arrastrado), pero ninguna tarea de API del MVP.

## Análisis de riesgos (backend)

| ID | Riesgo | P | G | Nivel | Cambio | Mitigación |
|---|---|:-:|:-:|:-:|:-:|---|
| R6 | Retraso del backend del MVP | 4 | 4 | 🟠 16 | ↑ | **Se materializó:** no hay API al cierre del MVP. Se acordó migrar el DER completo de una vez en el Sprint 3. |
| R12 | Existencias inconsistentes | 2 | 2 | 🟢 4 | = | Ya diseñado: tabla `inventory_movements` (kardex) y `lockForUpdate` sobre productos. |
| R3 | Filtración de datos de clientes | 2 | 4 | 🟡 8 | = | El diccionario marca como cifrados `pin_equipo` y `clave_autorizacion`. |
| R2 | Pérdida de la BD | 2 | 4 | 🟡 8 | = | Respaldos fuera del repositorio; estructura solo por migraciones. |

## Retrospectiva del backend

- **Qué salió bien:** el modelo de datos quedó completo y documentado (DER por módulo, diccionario columna por columna y reglas de integridad). Es la base de todo el backend.
- **Qué no salió bien:** el MVP del backend no se cumplió. El diseño del modelo tomó todo el sprint.
- **Acción para el siguiente sprint:** convertir el DER en migraciones y modelos completos para poder programar la API sin volver a tocar la estructura.
