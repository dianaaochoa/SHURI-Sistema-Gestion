# Changelog

Todos los cambios importantes de SHURI se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [Versionado Semántico](https://semver.org/lang/es/). El proceso está en [docs/release/proceso-de-release.md](docs/release/proceso-de-release.md).

## [Sin publicar]

### Pendiente para la siguiente versión
- Integración de los módulos de Cajera, Jefe, Técnico, Administrador y Portal con la API (Issues #33–#36).
- Pruebas del frontend, E2E e integración continua.

## [0.3.0] - 2026-11-26

PR #9, #10 y #32 · Backend completo, módulos de Técnico, Administrador y Portal, integración del acceso y documentación de pruebas.

### Agregado
- **Backend completo** (PR #10, Brisa): API REST `/api/v1` en Laravel 10 con 56 tablas, autenticación con Sanctum, MFA por correo, multisesión con cierre remoto, recuperación de contraseña por correo y pregunta secreta, bloqueo tras 3 intentos, control de acceso por roles y permisos, rate limiting y encabezados de seguridad OWASP.
- **Módulos de negocio del backend**: taller (recepción, asignación, banco de trabajo, cotización, garantías, refacciones, resguardo y abandono), inventario con kárdex, caja y punto de venta, compras a proveedores, chat del portal y facturación.
- **Módulos del frontend** (PR #9, Félix): Técnico (T1–T7, con versión tablet), Administrador (AD1–AD9) y Portal del cliente (P1–P6).
- **Integración del acceso con la API** (PR #32, Brisa y Félix): cliente HTTP con interceptor del token, login con MFA y redirección por rol, recuperación con pregunta secreta.
- Rol de **súper usuario** protegido del administrador.
- Preguntas de seguridad, nota de crédito, importación desde Excel, impresos y QR en el frontend (PR #32).
- **Documentación de pruebas**: plan de pruebas, 68 casos de prueba y registro de defectos (`docs/pruebas/`).
- **Proceso de liberación**: versionado, checklist, estrategia de despliegue y plan de reversión (`docs/release/`).
- Plantillas de Issue para **bugs** y **tareas**.
- Registro de sprints con análisis de riesgos (`docs/sprints/`) y guía de endpoints (`docs/api/endpoints.md`).

### Cambiado
- Diccionario de datos y DER actualizados al modelo en inglés (56 tablas).
- Optimización del frontend: paquete inicial de 446 KB y compilación sin avisos.

### Corregido
- `migrate:fresh` fallaba por un procedimiento almacenado duplicado (`82f6202`).
- No se podía cerrar el turno de caja si el conteo era menor al fondo (`d617c92`).
- Título del login en blanco y estilos que se mezclaban entre pantallas (`4be629f`).
- No se mostraba el saldo de los equipos en abandono al entregarlos (`4e15c46`).
- Conflictos entre las ramas de backend y frontend en las pantallas de acceso (`31ca27e`).

### Seguridad
- Contraseñas, códigos MFA y tokens de recuperación guardados con hash; PIN del equipo cifrado.
- Encabezados `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` y HSTS (con HTTPS).

## [0.2.0] - 2026-11-09

PR #7 · Maquetado de los módulos de Cajera y Jefe de técnicos.

### Agregado
- Pantallas de acceso del personal: iniciar sesión, olvidé mi contraseña, crear y cambiar contraseña.
- Estructura de la aplicación con menú lateral por rol, menú de usuario y notificaciones.
- Módulo **Cajera** (C1–C11): inicio, apertura de caja, punto de venta, ventas, órdenes de servicio, nueva orden, entrega de equipo, inventario, clientes, estadísticas, corte de caja y documentos impresos.
- Módulo **Jefe de técnicos** (J1–J11): tablero de órdenes, cotizar, garantías, refacciones, inventario, técnicos, equipos terminados, configuración, versión celular y mensajes de clientes.
- Tokens de diseño y estilos base del sistema de diseño de Figma.

## [0.1.0-sprint2] - 2026-10-20

PR #3, #4 y #5 · Documentación de las Unidades 1 y 2, prototipo y modelo de datos.

### Agregado
- README con la Unidad 1 (planteamiento, objetivos, requisitos, matriz de riesgos, plan de trabajo y arquitectura) y la Unidad 2 (Git y GitHub, flujo de trabajo, configuración, diagramas y diccionario).
- Prototipo de alta fidelidad en Figma exportado a `docs/diseno/` y diagrama de casos de uso.
- DER y diccionario de datos (51 tablas en 7 módulos) y `.gitignore` del proyecto.
- Plantilla de Pull Request, CODEOWNERS y protección de las ramas `main` y `develop`.

## [0.0.1] - 2026-10-11

### Agregado
- Estructura inicial del proyecto con Laravel 10 y Angular 17.

[Sin publicar]: https://github.com/dianaaochoa/SHURI-Sistema-Gestion/compare/v0.3.0...develop
[0.3.0]: https://github.com/dianaaochoa/SHURI-Sistema-Gestion/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/dianaaochoa/SHURI-Sistema-Gestion/compare/v0.1.0-sprint2...v0.2.0
[0.1.0-sprint2]: https://github.com/dianaaochoa/SHURI-Sistema-Gestion/releases/tag/v0.1.0-sprint2
[0.0.1]: https://github.com/dianaaochoa/SHURI-Sistema-Gestion/commit/ca56f2b
