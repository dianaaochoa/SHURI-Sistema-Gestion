# 🧪 Plan de pruebas · SHURI

| | |
|---|---|
| **Proyecto** | SHURI — Sistema Integral de Reparaciones y Ventas |
| **Versión del plan** | 1.0 |
| **Responsable del plan** | Diana Paola Ochoa Altamirano (Líder / QA) |
| **Última actualización** | 24 de noviembre de 2026 |
| **Documentos relacionados** | [Casos de prueba](casos-de-prueba.md) · [Registro de defectos](registro-de-defectos.md) · [Proceso de liberación](../release/proceso-de-release.md) |

---

## 1. Objetivos

1. **Verificar que el MVP funciona de punta a punta**: recepción del equipo con folio, asignación al técnico, diagnóstico, cotización, cobro en el punto de venta y seguimiento en el portal del cliente (README §5.3).
2. **Comprobar los requisitos funcionales** RF-01 a RF-17 y los no funcionales RNF-01 a RNF-04 (README §6).
3. **Validar la seguridad**: autenticación con MFA, multisesión, recuperación de contraseña, control de acceso por rol y protección contra los riesgos de OWASP.
4. **Garantizar la integridad de los datos**: el stock nunca queda negativo, los cobros son atómicos (rollback ante errores) y las bitácoras no se pueden alterar.
5. **Detectar defectos antes de cada liberación** y registrarlos con su severidad, su corrección y su evidencia.

## 2. Alcance

### 2.1 Dentro del alcance

| Módulo | Qué se prueba |
|---|---|
| Acceso y seguridad | Login del personal y del cliente, MFA, bloqueo por intentos, multisesión, recuperación de contraseña, permisos por rol |
| Taller | Recepción, asignación, banco de trabajo, cotización, garantías, refacciones, resguardo y abandono |
| Caja y punto de venta | Turnos, retiros, corte, ventas, descuentos con autorización, entrega de equipos |
| Inventario y compras | Catálogo, kárdex, ajustes, proveedores, pedidos y pagos |
| Portal del cliente | Acceso, seguimiento, aprobación de presupuestos, garantía y chat |
| Administración | Usuarios, súper usuario, reportes, configuración y facturación |
| Interfaz | Navegación por rol, diseño adaptativo (360 px a 1920 px) y fidelidad con el prototipo de Figma |

### 2.2 Fuera del alcance

- Pruebas de carga a gran escala (RNF-02 se verifica con una prueba básica de 50 peticiones concurrentes).
- Envío real de correos: en pruebas se usa `MAIL_MAILER=log` y se valida el registro en `sent_emails`.
- Timbrado real de facturas ante el SAT (se prueba la generación, no el timbrado).
- Pasarelas de pago y paqueterías (fuera del alcance del proyecto, README §5.2).

## 3. Tipos de prueba

| Tipo | Qué verifica | Herramienta | Dónde vive | Responsable |
|---|---|---|---|---|
| **Unitarias (backend)** | Reglas de negocio aisladas, como el flujo de estados de una orden | PHPUnit 10 | `backend/tests/Unit/` | Brisa |
| **Unitarias (frontend)** | Servicios, guards, interceptor y componentes de Angular | Jasmine + Karma | `frontend/src/**/*.spec.ts` | Félix |
| **Integración (API + BD)** | Cada endpoint contra una base MySQL real: validaciones, permisos, transacciones y respuestas | PHPUnit (pruebas *Feature*) con `RefreshDatabase` | `backend/tests/Feature/` | Brisa |
| **Funcionales / E2E** | Flujos completos desde el navegador: frontend + API + BD | Playwright | `frontend/e2e/` | Félix |
| **Seguridad** | Autenticación, autorización, rutas protegidas, tokens, inyección SQL, XSS, CSRF, IDOR y encabezados | PHPUnit + pruebas manuales guiadas por OWASP | `backend/tests/Feature/Security/`, `Auth/` | Brisa (Diana revisa) |
| **Regresión** | Que lo que ya funcionaba siga funcionando | Toda la suite, automáticamente en cada PR | GitHub Actions | Automático |
| **Usabilidad y diseño** | Fidelidad con Figma y diseño adaptativo | Revisión manual en 360, 768, 1366 y 1920 px | Casos `UI-xx` | Félix (Diana valida) |

## 4. Ambientes

| Ambiente | Uso | Base de datos | Rama |
|---|---|---|---|
| **Local** | Desarrollo y pruebas de cada integrante | MySQL 8 local, base `shuri_test` para pruebas automáticas | Ramas `feature/*` |
| **Integración continua** | Ejecutar la suite en cada Pull Request | MySQL 8 en contenedor de GitHub Actions | PR hacia `develop` y `main` |
| **Staging** | Pruebas E2E y revisión antes de liberar | MySQL en la nube (datos de prueba) | `develop` |
| **Producción** | Versión liberada | MySQL en la nube | `main` |

**Datos de prueba:** `php artisan migrate:fresh --seed` crea catálogos, configuración y un usuario por rol (`admin`, `jefe`, `carlos`, `laura`, `sofia`).

## 5. Criterios de entrada y salida

**Una funcionalidad entra a pruebas cuando:**
- Está en un Pull Request hacia `develop` con la plantilla completa.
- Compila sin errores (`ng build`) y la migración corre desde cero (`migrate:fresh --seed`).

**Una versión se puede liberar cuando:**
- El **100 % de las pruebas automáticas pasan** (backend y frontend).
- Los casos de prueba **críticos y altos** están en estado *Aprobado*.
- No hay defectos abiertos de severidad **crítica o alta**.
- El checklist de liberación está completo ([proceso de liberación](../release/proceso-de-release.md)).

## 6. Criterios de aceptación

| Criterio | Meta |
|---|---|
| Pruebas automáticas del backend | 100 % aprobadas |
| Cobertura de código del backend (líneas) | ≥ 70 % en `app/Services` y `app/Http/Controllers` |
| Pruebas unitarias del frontend | Servicios de acceso, guards e interceptor cubiertos |
| Flujos E2E críticos | Login con MFA, recuperación, acceso por rol, venta y orden completa: 100 % aprobados |
| Seguridad | Ninguna ruta privada accesible sin token o sin permiso; ninguna contraseña en texto plano |
| Rendimiento (RNF-02) | Respuesta < 2 s con 50 peticiones concurrentes en consulta de folio |
| Diseño adaptativo (RNF-03) | Sin desbordes entre 360 px y 1920 px |

## 7. Responsables

| Integrante | Responsabilidades |
|---|---|
| **Diana Ochoa** (Líder / QA) | Elabora y mantiene este plan, los casos de prueba y el registro de defectos. Clasifica la severidad de los defectos, revisa cada PR y aprueba la liberación |
| **Brisa Luna** (Backend) | Pruebas unitarias, de integración y de seguridad del backend. Configura GitHub Actions y el reporte de cobertura |
| **Félix Martínez** (Frontend) | Pruebas unitarias de Angular, pruebas E2E con Playwright y revisión de diseño adaptativo |
| **Todo el equipo** | Registrar cada defecto encontrado como Issue con la plantilla **Bug** |

## 8. Gestión de defectos

1. Quien encuentra el error abre una Issue con la plantilla **🐞 Bug** (`.github/ISSUE_TEMPLATE/bug.yml`): descripción, pasos para reproducir, resultado esperado y obtenido, severidad y evidencia.
2. Diana confirma la **severidad** y lo asigna.
3. Quien lo corrige abre un PR con `Closes #número` y, de ser posible, **agrega una prueba automática** que reproduce el error.
4. Al combinarse el PR, el defecto se cierra y se agrega al [registro de defectos](registro-de-defectos.md).

| Severidad | Definición | Tiempo de atención |
|---|---|---|
| 🔴 **Crítica** | Bloquea el sistema, pierde datos o expone información | Inmediato; bloquea la liberación |
| 🟠 **Alta** | Una funcionalidad del MVP no funciona y no hay alternativa | Antes de la siguiente liberación |
| 🟡 **Media** | Falla con alternativa o afecta a un caso poco frecuente | En el sprint actual |
| 🟢 **Baja** | Detalle visual o de redacción | Cuando haya capacidad |

## 9. Ejecución y evidencias

| Prueba | Comando | Evidencia |
|---|---|---|
| Backend completo | `cd backend && php artisan test` | Resultado en la consola y en GitHub Actions |
| Cobertura del backend | `php artisan test --coverage` (requiere Xdebug o PCOV) | Reporte en `backend/coverage/` y captura en el PR |
| Frontend unitarias | `cd frontend && ng test --watch=false --code-coverage` | Reporte en `frontend/coverage/` |
| E2E | `cd frontend && npx playwright test` | Reporte HTML de Playwright |
| Todo en cada PR | Automático | Pestaña **Checks** del Pull Request |

## 10. Estado actual (24 nov 2026)

| Tipo | Estado | Resultado |
|---|---|---|
| Backend: unitarias + integración (API + BD) | ✅ Implementadas | **269 pruebas aprobadas, 1,449 verificaciones**, en 28 archivos |
| Seguridad (autenticación, autorización, sesiones, recuperación, encabezados) | ✅ Implementadas en parte | Incluidas en las 269. **Faltan**: inyección SQL, XSS, CSRF e IDOR explícitas |
| Frontend unitarias | ⏳ Pendiente | Solo existe la prueba por defecto de Angular |
| E2E | ⏳ Pendiente | Herramienta definida: Playwright |
| Integración continua | ⏳ Pendiente | GitHub Actions |
| Cobertura | ⏳ Pendiente | Requiere instalar PCOV o Xdebug |

## 11. Calendario

| Actividad | Responsable | Fecha objetivo |
|---|---|---|
| Plan de pruebas, casos de prueba y registro de defectos | Diana | 24 nov ✅ |
| GitHub Actions (backend + frontend) | Brisa | 27 nov |
| Pruebas de seguridad faltantes (SQLi, XSS, CSRF, IDOR) | Brisa | 28 nov |
| Pruebas unitarias del frontend | Félix | 28 nov |
| Pruebas E2E con Playwright | Félix | 2 dic |
| Ejecución completa, reporte de cobertura y liberación `v1.0.0` | Todo el equipo | 4 dic |

## 12. Riesgos de las pruebas

| Riesgo | Mitigación |
|---|---|
| Las pruebas E2E dependen de que la integración esté terminada | Empezar por los flujos ya integrados (acceso) y agregar los demás conforme se conecten |
| Sin servidor de correo, no se puede probar el MFA de punta a punta | En pruebas se lee el código desde el registro (`MAIL_MAILER=log`) o con un buzón de prueba |
| Diferencias entre MySQL local y el de producción | Las pruebas automáticas corren contra MySQL 8, igual que producción |
