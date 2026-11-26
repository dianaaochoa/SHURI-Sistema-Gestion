# 🐞 Registro de defectos · SHURI

Registro de los errores encontrados durante el desarrollo y las pruebas, con su severidad, cómo reproducirlos y cómo se resolvieron. El proceso está en el [plan de pruebas §8](plan-de-pruebas.md#8-gestión-de-defectos).

**A partir del 24 de noviembre de 2026, cada defecto nuevo se registra como Issue** con la plantilla **🐞 Bug** y la etiqueta `bug`, y se cierra con el Pull Request que lo corrige (`Closes #número`). Esta tabla resume todos los defectos, incluidos los anteriores a esa fecha, que se documentaron a partir de sus commits de corrección.

**Severidad:** 🔴 Crítica · 🟠 Alta · 🟡 Media · 🟢 Baja

---

## Resumen

| ID | Defecto | Módulo | Severidad | Detectado | Estado | Corrección |
|---|---|---|---|---|---|---|
| BUG-01 | Conflicto en el README al integrar la rama de backend | Repositorio | 🟡 Media | 20 oct | ✅ Resuelto | PR #3 |
| BUG-02 | `migrate:fresh` falla por procedimiento almacenado duplicado | Base de datos | 🟠 Alta | 9 nov | ✅ Resuelto | `82f6202` |
| BUG-03 | No se puede cerrar el turno si el conteo es menor al fondo | Caja | 🟠 Alta | 9 nov | ✅ Resuelto | `d617c92` |
| BUG-04 | Título del login en blanco y estilos que se mezclan entre pantallas | Frontend | 🟡 Media | 10 nov | ✅ Resuelto | `4be629f` |
| BUG-05 | 5 tablas del código sin documentar en el diccionario de datos | Documentación | 🟡 Media | 17 nov | ✅ Resuelto | `540bffc` |
| BUG-06 | No se muestra el saldo de los equipos en abandono al entregarlos | Taller | 🟠 Alta | 16 nov | ✅ Resuelto | `4e15c46` |
| BUG-07 | Conflictos entre las ramas de backend y frontend en las pantallas de acceso | Integración | 🟠 Alta | 23 nov | ✅ Resuelto | `31ca27e` (PR #32) |
| BUG-08 | 41 avisos de tamaño de estilos al compilar el frontend | Frontend | 🟢 Baja | 17 nov | ✅ Resuelto | `b6d6d69` (PR #32) |

**Totales:** 8 defectos · 8 resueltos · 0 abiertos.

---

## Detalle

### BUG-01 · Conflicto en el README al integrar la rama de backend
| | |
|---|---|
| **Severidad** | 🟡 Media |
| **Detectado por / fecha** | Diana · 20 oct 2026 |
| **Descripción** | El PR #2 (`feature/backend` → `main`) no se podía combinar porque `feature/backend` se creó antes de un cambio al `README.md` en `main`. |
| **Pasos para reproducir** | 1. Abrir el PR #2. 2. GitHub indica "This branch has conflicts". |
| **Resultado esperado** | Combinación sin conflictos. |
| **Resultado obtenido** | Conflicto de contenido en `README.md`. |
| **Resolución** | Se integró `feature/backend` en `feature/docs-architecture` y se resolvió el conflicto conservando el DER y el diccionario de Brisa dentro del README completo. Entró con el PR #3, y los PR #1 y #2 se marcaron como combinados. |
| **Estado** | ✅ Resuelto |

### BUG-02 · `migrate:fresh` falla por procedimiento almacenado duplicado
| | |
|---|---|
| **Severidad** | 🟠 Alta: impedía recrear la base de datos y correr las pruebas desde cero |
| **Detectado por / fecha** | Brisa · 9 nov 2026 |
| **Descripción** | `migrate:fresh` borra tablas y vistas, pero no los procedimientos almacenados. Al recrear la base, `sp_process_storage` fallaba con *"already exists"*. |
| **Pasos para reproducir** | 1. `php artisan migrate --seed`. 2. `php artisan migrate:fresh --seed`. |
| **Resultado esperado** | La base se recrea completa. |
| **Resultado obtenido** | Error: el procedimiento ya existe. |
| **Resolución** | Se agregó `DROP PROCEDURE IF EXISTS` antes de crearlo. Las pruebas automáticas recrean la base en cada ejecución, lo que evita que vuelva a pasar. |
| **Estado** | ✅ Resuelto en `82f6202` |

### BUG-03 · No se puede cerrar el turno si el conteo es menor al fondo
| | |
|---|---|
| **Severidad** | 🟠 Alta: bloqueaba el corte de caja |
| **Detectado por / fecha** | Félix · 9 nov 2026 |
| **Descripción** | El fondo que se queda en caja estaba fijo en $1,000. Si se contaba menos, el cierre se rechazaba con un error poco visible. |
| **Pasos para reproducir** | 1. Abrir turno. 2. Ir al corte (C10.4). 3. Contar menos de $1,000. 4. Intentar cerrar. |
| **Resultado esperado** | Se permite cerrar indicando lo que falta. |
| **Resultado obtenido** | El cierre se rechazaba sin explicación clara. |
| **Resolución** | El fondo sigue al conteo hasta que la cajera lo escribe, y lo que falta para cerrar se muestra junto al botón. |
| **Estado** | ✅ Resuelto en `d617c92` |

### BUG-04 · Título del login en blanco y estilos que se mezclan entre pantallas
| | |
|---|---|
| **Severidad** | 🟡 Media |
| **Detectado por / fecha** | Félix · 10 nov 2026 |
| **Descripción** | Algunas clases de CSS de una pantalla afectaban a otras: el título del login salía en blanco, las tarjetas del tablero heredaban sombras y, a 360 px, el selector de periodo de Ventas se salía de la pantalla. |
| **Pasos para reproducir** | 1. Abrir el login. 2. Abrir Ventas en un celular de 360 px. |
| **Resultado esperado** | Cada pantalla igual a Figma, sin desbordes. |
| **Resultado obtenido** | Título invisible y selector fuera de la pantalla. |
| **Resolución** | Se renombraron las clases en conflicto (`.portada`, `.fuerza`, `.tarjeta-orden`, `.tarjeta-tecnico`) y se ajustó el selector para 360 px. |
| **Estado** | ✅ Resuelto en `4be629f` |

### BUG-05 · 5 tablas del código sin documentar en el diccionario de datos
| | |
|---|---|
| **Severidad** | 🟡 Media: inconsistencia entre la documentación y la base de datos |
| **Detectado por / fecha** | Diana (revisión de la rama de backend) · 17 nov 2026 |
| **Descripción** | `labor_levels`, `message_templates`, `quick_replies`, `role_substitutions` y `two_factor_challenges` existían en las migraciones, pero no en el diccionario. |
| **Pasos para reproducir** | Comparar las tablas de `backend/database/migrations` con las de `backend/README.md`. |
| **Resultado esperado** | Las 56 tablas documentadas. |
| **Resultado obtenido** | 51 de 56 documentadas. |
| **Resolución** | Se completó el diccionario. |
| **Estado** | ✅ Resuelto en `540bffc` |

### BUG-06 · No se muestra el saldo de los equipos en abandono al entregarlos
| | |
|---|---|
| **Severidad** | 🟠 Alta: no se podía cobrar el almacenaje al entregar |
| **Detectado por / fecha** | Brisa · 16 nov 2026 |
| **Descripción** | Cuando la configuración permite entregar equipos en abandono, la consulta de la orden no devolvía el saldo pendiente. |
| **Pasos para reproducir** | 1. Orden en abandono con entrega permitida. 2. Consultar su saldo para entregarla. |
| **Resultado esperado** | Saldo con el cargo de almacenaje. |
| **Resultado obtenido** | Sin saldo. |
| **Resolución** | `ServiceOrderResource` calculaba el saldo solo para los estados entregables fijos. Ahora usa los estados entregables de `StorageService`, que incluyen el abandono cuando la configuración lo permite. **Pendiente:** agregar una prueba automática que cubra este caso. |
| **Estado** | ✅ Resuelto en `4e15c46` |

### BUG-07 · Conflictos entre las ramas de backend y frontend en las pantallas de acceso
| | |
|---|---|
| **Severidad** | 🟠 Alta: impedía integrar la conexión con la API |
| **Detectado por / fecha** | Diana (revisión de ramas) · 23 nov 2026 |
| **Descripción** | Brisa (integración con la API) y Félix (preguntas de seguridad) modificaron los mismos 4 archivos: `auth.service.ts`, `iniciar-sesion.component.ts` y `olvide-contrasena.component.{html,ts}`. |
| **Pasos para reproducir** | `git merge-tree origin/feature/backend origin/feature/frontend-ui` muestra conflicto en los 4 archivos. |
| **Resultado esperado** | Las dos ramas se combinan sin perder trabajo. |
| **Resultado obtenido** | Conflicto de contenido. |
| **Resolución** | Félix integró `feature/backend` en `feature/frontend-ui` conservando la conexión a la API de Brisa y su diseño. Se verificó: `ng build` sin errores y 269 pruebas del backend aprobadas. |
| **Estado** | ✅ Resuelto en `31ca27e` (PR #32) |

### BUG-08 · 41 avisos de tamaño de estilos al compilar el frontend
| | |
|---|---|
| **Severidad** | 🟢 Baja: no afectaba el funcionamiento |
| **Detectado por / fecha** | Diana (revisión de la rama de frontend) · 17 nov 2026 |
| **Descripción** | `ng build` mostraba 41 avisos de que varios archivos de estilos superaban el presupuesto de 2 KB. |
| **Pasos para reproducir** | `cd frontend && ng build`. |
| **Resultado esperado** | Compilación sin avisos. |
| **Resultado obtenido** | 41 avisos. |
| **Resolución** | Limpieza y optimización del frontend; el paquete inicial bajó a 446 KB. |
| **Estado** | ✅ Resuelto en `b6d6d69` (PR #32): `ng build` con 0 avisos |

---

## Cómo registrar un defecto nuevo

1. **Issues → New issue → 🐞 Bug**.
2. Llenar todos los campos: descripción, pasos, resultado esperado y obtenido, severidad y evidencia (captura o mensaje de error).
3. Diana confirma la severidad y lo asigna.
4. El PR que lo corrige incluye `Closes #número` y, si es posible, una prueba automática que reproduce el error.
5. Al cerrarse, se agrega una fila a esta tabla.
