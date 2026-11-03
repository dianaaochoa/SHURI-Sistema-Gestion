# Bitácora del frontend · SHURI

Registro vivo de lo que se construye en el frontend (Angular 17). Se actualiza **en cada avance** para no perder el contexto entre sesiones: qué está hecho, cómo está organizado, qué decisiones se tomaron y qué sigue.

- **Diseño fuente:** [Figma · SHURI](https://www.figma.com/design/wUFXid6RcC3a6H9iEdokWi/Untitled) (exportes en [`docs/diseno/`](../docs/diseno/README.md))
- **Rama de trabajo:** `feature/frontend-ui`
- **Última actualización:** 2 nov 2026

---

## 1. Grafo de avance por módulo

Cada nodo es una sección de Figma. Verde = hecho · amarillo = en curso · gris = pendiente.

```mermaid
flowchart LR
  classDef hecho fill:#eaf6ef,stroke:#187047,color:#17374e
  classDef curso fill:#fff4dc,stroke:#925d0b,color:#17374e
  classDef pendiente fill:#f3f4f6,stroke:#94a3b8,color:#64748b

  BASE["Tokens y estilos base<br/>styles.css"]:::hecho

  subgraph ACC["01 · Acceso del personal"]
    A1["A.1 Iniciar sesión"]:::hecho
    A2["A.2 Datos incorrectos"]:::hecho
    A3["A.3 ¿Olvidaste tu contraseña?"]:::hecho
    A4["A.4 Correo enviado"]:::hecho
    A5["A.5 Crea tu contraseña"]:::hecho
    A6["A.6 Cambiar contraseña (perfil)"]:::pendiente
  end

  subgraph SHELL["Estructura de la app"]
    MENU["Menú lateral 184 px<br/>+ riel 72 px + cajón celular"]:::hecho
    USR["Menú de usuario"]:::hecho
    NOT["Panel de notificaciones"]:::hecho
  end

  subgraph ADM["02 · Administrador"]
    AD["AD1–AD9"]:::pendiente
  end
  subgraph CAJ["03 · Cajera"]
    C1["C1 Inicio y apertura de caja<br/>C1.1–C1.5 · C1.7"]:::hecho
    C16["C1.6 Mi perfil y contraseña"]:::pendiente
    C["C2–C11"]:::pendiente
  end
  subgraph JEF["04 · Jefe de técnicos"]
    J["J1–J11"]:::pendiente
  end
  subgraph TEC["05 · Técnico"]
    T["T1–T7"]:::pendiente
  end
  subgraph POR["06 · Portal del cliente"]
    P["P1–P6"]:::pendiente
  end

  BASE --> ACC
  BASE --> SHELL
  ACC -->|"un solo login,<br/>cada rol a su inicio"| SHELL
  SHELL --> ADM & CAJ & JEF & TEC
  USR --> A6
  C1 -->|"Ir a corte de caja"| C
  BASE --> POR
```

## 2. Grafo de navegación (rutas actuales)

```mermaid
flowchart TD
  classDef ruta fill:#e7f5f7,stroke:#087f91,color:#17374e
  classDef guarda fill:#fff4dc,stroke:#925d0b,color:#17374e
  classDef rol fill:#ffffff,stroke:#17374e,color:#17374e

  RAIZ(["/"]) --> LOGIN
  LOGIN["/iniciar-sesion<br/>A.1 · A.2"]:::ruta
  OLV["/olvide-contrasena<br/>A.3 · A.4"]:::ruta
  CREAR["/crear-contrasena<br/>A.5"]:::ruta
  INICIO{{"/inicio · aSuInicio"}}:::guarda
  G1{{"conContrasenaTemporal"}}:::guarda

  LOGIN -->|"¿Olvidaste tu contraseña?"| OLV
  OLV -->|"Volver / Entrar con temporal"| LOGIN
  LOGIN -->|"entra con contraseña temporal"| G1 --> CREAR
  LOGIN -->|"entra con su contraseña"| INICIO
  CREAR -->|"Guardar y entrar"| INICIO
  CREAR -->|"Salir sin guardar"| LOGIN

  INICIO --> ADMR["/administrador/…<br/>soloRol"]:::rol
  INICIO --> CAJR["/cajera/…<br/>soloRol"]:::rol
  INICIO --> JEFR["/jefe/…<br/>soloRol"]:::rol
  INICIO --> TECR["/tecnico/…<br/>soloRol"]:::rol

  ADMR & CAJR & JEFR & TECR -->|"Menú de usuario › Cerrar sesión"| LOGIN
```

Cada rol tiene `inicio`, una ruta por cada destino de su menú, `perfil` y `cambiar-contrasena`. Las rutas se generan desde `sistema/navegacion.ts`, así que agregar un destino al menú crea también su ruta. Si un rol entra a una ruta de otro rol, `soloRol` lo regresa a su propio inicio.

## 3. Grafo de componentes

```mermaid
flowchart LR
  classDef comp fill:#ffffff,stroke:#087f91,color:#17374e
  classDef serv fill:#e7f5f7,stroke:#087f91,color:#17374e
  classDef css fill:#f9fafb,stroke:#dce2e8,color:#64748b

  APP["AppComponent<br/>router-outlet"]:::comp
  RUT["app.routes.ts<br/>aSuInicio · soloRol · conContrasenaTemporal"]:::serv
  NAV["sistema/navegacion.ts<br/>menú de cada rol"]:::serv

  subgraph ACCESO["acceso/"]
    LAY["AccesoLayout"]:::comp
    IS["IniciarSesion"]:::comp
    OC["OlvideContrasena"]:::comp
    CC["CrearContrasena"]:::comp
  end

  subgraph SISTEMA["sistema/"]
    SL["SistemaLayout<br/>barra celular + contenido"]:::comp
    ML["MenuLateral<br/>184 / 72 / cajón"]:::comp
    MU["MenuUsuario"]:::comp
    PN["PanelNotificaciones"]:::comp
    PP["PaginaPendiente<br/>lugar de cada pantalla"]:::comp
  end

  subgraph CAJERA["cajera/"]
    IC["InicioCajera<br/>C1.1 · C1.2"]:::comp
    AT["AbrirTurno<br/>modal C1.3"]:::comp
    ST["SalirConTurno<br/>modal C1.7"]:::comp
  end

  AUTH["AuthService<br/>(simulado)"]:::serv
  NOTS["NotificacionesService<br/>(simulado)"]:::serv
  CAJA["CajaService<br/>turno de caja (simulado)"]:::serv
  FMT["compartido/formato.ts<br/>$1,234.56 · 16 oct 2026"]:::serv
  GLB["styles.css<br/>tokens + .campo .boton .icono .avatar .popover<br/>.panel .fila .indicador .estado .tecla .modal"]:::css

  APP --> RUT
  RUT --> LAY --> IS & OC & CC
  RUT --> SL --> ML --> MU & PN
  ML --> ST
  SL --> PP & IC
  IC --> AT
  NAV --> RUT & ML & PP
  IS & OC & CC & ML & MU & PP --> AUTH
  PN --> NOTS --> AUTH
  IC & AT & ST & ML & MU & PP --> CAJA
  IC & AT & ST --> FMT
  GLB -.-> ACCESO & SISTEMA & CAJERA
```

---

## 4. Cómo correrlo

```bash
cd frontend
npm install
npm start          # http://localhost:4200
npm run build      # compilación de producción
```

**Usuarios de prueba** (mientras no exista la API de Laravel), definidos en `src/app/acceso/auth.service.ts`:

| Usuario | Contraseña | Rol / resultado |
|---|---|---|
| `vcastillo` | `Shuri2026!` | Administradora → `/administrador/inicio` |
| `amartinez` | `Shuri2026!` | Cajera → `/cajera/inicio` |
| `jlopez` | `Shuri2026!` | Jefe de técnicos → `/jefe/inicio` |
| `cruiz` | `Shuri2026!` | Técnico → `/tecnico/inicio` |
| `nuevo` | `temporal123` | Simula primer ingreso → A.5 (técnico) |
| cualquier otro | — | A.2: “Te quedan N intentos”; al 3.º fallo la cuenta se bloquea |

Los nombres y puestos son los de las pantallas de Figma (Verónica Castillo, Ana Martínez, Jorge López, Carlos Ruiz).

**Caja de la cajera:**
- La primera vez entra con la **caja cerrada** (C1.2).
- Para abrirla se cuenta el fondo en el modal; con 2×$200, 3×$100, 4×$50 y 5×$20 coincide con el fondo asignado de $1,000.
- El turno se guarda en `localStorage` (`shuri.turno`). Para volver a probar la caja cerrada, borra esa clave o ejecuta `localStorage.clear()` en la consola.

## 5. Estructura de carpetas

```
frontend/src/
├── index.html                 # lang="es", fuente Inter (Google Fonts)
├── styles.css                 # tokens de Figma + clases compartidas
├── assets/
│   ├── acceso/                # logo-shuri.png, elipses del panel de marca
│   ├── iconos/                # SVG de las pantallas de acceso
│   ├── menu/                  # SVG del menú lateral, usuario y notificaciones
│   └── cajera/                # SVG de las pantallas de la cajera
└── app/
    ├── app.routes.ts          # rutas + guardas; PANTALLAS = las ya construidas
    ├── compartido/
    │   └── formato.ts         # dinero, fechas, horas, duración, saludo
    ├── cajera/
    │   ├── caja.service.ts    # turno de caja abierto/cerrado (simulado)
    │   ├── inicio-cajera/     # C1.1 · C1.2 (+ .datos.ts con los datos de Figma)
    │   ├── abrir-turno/       # C1.3 modal de conteo del fondo
    │   └── salir-con-turno/   # C1.7 modal al cerrar sesión con caja abierta
    ├── acceso/
    │   ├── auth.service.ts    # sesión, intentos, contraseña temporal (simulado)
    │   ├── acceso-layout/     # marco común A.1–A.5
    │   ├── iniciar-sesion/    # A.1 · A.2
    │   ├── olvide-contrasena/ # A.3 · A.4
    │   └── crear-contrasena/  # A.5 + indicador de seguridad
    └── sistema/
        ├── navegacion.ts            # menú de cada rol (fuente única de menú y rutas)
        ├── notificaciones.service.ts# avisos de la campana (simulado)
        ├── sistema-layout/          # menú + contenido; barra superior en celular
        ├── menu-lateral/            # 184 px · riel 72 px · cajón
        ├── menu-usuario/            # desplegable del avatar
        ├── panel-notificaciones/    # panel de la campana
        └── pagina-pendiente/        # lugar temporal de cada pantalla por construir
```

## 6. Convenciones

- **Componentes standalone**, `signal()` / `computed()` para estado, `input()` / `output()` de señales, **Reactive Forms** (`NonNullableFormBuilder`), control de flujo nuevo (`@if`, `@for`).
- **Nombres en español** (componentes, clases CSS, variables), igual que en Figma.
- **Colores:** siempre `var(--color-*)` de `styles.css`. Los nombres salen de las variables de Figma (`color/primario` → `--color-primario`).
- **Estilos compartidos en `styles.css`**, uno por componente de Figma:
  - Formularios y acciones: `.tarjeta`, `.campo`, `.boton--primario`, `.boton--contorno`, `.enlace`, `.casilla`
  - Avisos y popovers: `.aviso--error`, `.aviso--advertencia`, `.popover`, `.modal-fondo`, `.modal`
  - Componentes de datos: `.panel`, `.fila`, `.indicador`, `.estado--<tono>`, `.tecla`
  - Otros: `.icono`, `.avatar`, `.encabezado-pagina`

  El presupuesto de CSS por componente es 2 kB de aviso y 4 kB de error, así que lo reutilizable va global y lo específico va en el componente.
- **Pantallas construidas:** se registran en `PANTALLAS` de `app.routes.ts` (`'cajera/inicio': InicioCajeraComponent`). Las que no están ahí usan `PaginaPendienteComponent`.
- **Datos de prueba de una pantalla:** en un archivo `<pantalla>.datos.ts` junto al componente, con los textos de Figma y la forma que tendrá la respuesta de la API.
- **Formatos:** siempre con `compartido/formato.ts` (`formatearDinero`, `formatearFechaLarga`, `formatearHora`, `formatearDuracion`, `saludoDelDia`).
- **Íconos:** se descargan de Figma, no se redibujan.
  - Con color fijo: `<img>` con su `width`/`height` original.
  - Si cambian de color según el estado (menú): `<span class="icono" [style.--icono]="'url(assets/menu/x.svg)'">`, que usa el SVG como máscara y lo pinta con `color`.
- **Menú y rutas:** para agregar una pantalla, primero se añade el destino en `sistema/navegacion.ts`. Su ruta se crea sola con `PaginaPendienteComponent`. Al construirla, se cambia `component` en `rutasDeRol` (o se agrega una excepción para esa ruta).
- **Reglas de Figma aplicadas** (página “Componentes y tokens › Reglas de comportamiento”):
  - Campo en foco: borde 1.5 px `--color-primario`. Campo con error: borde 1.5 px `--color-peligro`.
  - Validación al salir del campo y al guardar; el mensaje va en rojo debajo del campo.
  - Campos obligatorios con `*`.
  - Base 1440 × 900 con menú de 184 px. En 1366 × 768 o menos, el menú se compacta a íconos (72 px) y se abre al pasar el mouse.
  - Un solo login: cada rol entra a su inicio.
- **Responsivo:** mínimo 360 px de ancho (lo exige el checklist de PR).
  - Acceso: debajo de 960 px se oculta el panel de marca.
  - Sistema: debajo de 768 px el menú pasa a un cajón que se abre desde una barra superior.

## 7. Flujo de trabajo del equipo

Reglas tomadas del [README principal](../README.md) (sección 12) y de [`.github/`](../.github/):

- Flujo de ramas: `feature/frontend-ui` → **PR a `develop`** → `develop` pasa a `main` al cierre de cada sprint. **Nunca abrir el PR directo a `main`.**
- **Diana** (`@dianaaochoa`, CODEOWNERS) revisa y aprueba todos los PR. Política de unión: *merge commit*.
- Checklist del PR ([plantilla](../.github/pull_request_template.md)):
  - rama actualizada con `develop`
  - commits `tipo(modulo): descripción`
  - `ng build` sin errores
  - sin `node_modules/`
  - vista adaptable a **360 px** y escritorio
- Antes de abrir un PR: traer `origin/develop` a esta rama (merge, no rebase) y volver a compilar.
- Sprint 3: 26 oct – 8 nov · Sprint 4: 9 – 22 nov 2026 (cierre del proyecto).

## 8. Decisiones y desviaciones del diseño

| Tema | Decisión | Motivo |
|---|---|---|
| Pastillas y círculos del panel de marca | Fondo blanco 8 % / borde 18 %; círculos con la opacidad de los SVG de A.5 | El exporte de Figma de A.1–A.3 pierde la transparencia (salían blancos). Se siguió el PNG de `docs/diseno` y A.5. |
| “Recordar este equipo” | Guarda la sesión en `localStorage` (si no, en `sessionStorage`) | El diseño no lo especifica. |
| Niveles del indicador de contraseña | 0–2 requisitos: Débil (rojo) · 3: Media (ámbar) · 4: Segura (verde) | Figma solo trae la variante “Segura”. |
| Requisito no cumplido | Círculo gris vacío | Figma solo muestra requisitos cumplidos. |
| Estilos | CSS propio con tokens de Figma, sin Tailwind ni Angular Material | `frontend/README.md` menciona “Tailwind CSS / Angular Material”, pero ninguno está instalado. Con CSS propio se copia el diseño de Figma tal cual. Pendiente acordarlo con el equipo. |
| Destino activo en el riel | Fondo `marino-activo` + ícono cian, igual que en el menú de 184 px | El componente “Navegación lateral · Ancho=72” usa fondo `primario`, pero las pantallas a 1366 px usan el mismo estilo que el menú ancho. Se siguieron las pantallas. |
| Fijar el riel abierto | Al pasar el mouse, el riel muestra “Fijar abierto”; en 184 px dice “Contraer”. La preferencia se guarda en `localStorage`. | Figma muestra “Contraer” pero no cómo volver a expandir. |
| Menú en celular | Cajón de 260 px con barra superior (☰ SHURI) | Figma solo tiene versión celular para el jefe (J10) y tablet para el técnico (T7); se hará cuando se construyan esas pantallas. |
| Avisos de la campana | Datos de prueba por rol; los del técnico son los de T1.2 | No hay API todavía. |
| Menú de usuario de la cajera | “Turno abierto desde HH:MM” como línea informativa (no clicable) | Así aparece en C1.5; Figma no indica a dónde lleva. |
| Pantallas no construidas | `PaginaPendiente` con título, saludo en Inicio y clave de Figma | Permite navegar todo el menú desde ya. |
| Estado inicial de la caja (demo) | La cajera entra con la caja cerrada (C1.2) | Así se puede probar todo el flujo C1.2 → C1.3 → C1.1. |
| Fondo contado distinto al asignado | Se permite abrir; el total se pinta en ámbar con “Faltan/Sobran $X” | Figma solo muestra el caso que coincide. |
| Centavos en el conteo | Se capturan como importe (0.00–0.99), no como cantidad | Figma muestra “—” en la cantidad de centavos. |
| Atajos F1–F5 | F1/F4 con la caja cerrada abren el modal de abrir turno. F5 no recarga la página mientras se está en el inicio. | Las teclas vienen de Figma; el comportamiento con la caja cerrada no está definido. |
| Cifras del inicio | Las de Figma (ventas, entregas, paneles). “Efectivo en caja” = $6,180 de ventas + el fondo contado. | No hay API todavía. |
| C1.7 · “Salir sin cerrar el turno” | Al elegir esa opción, el botón principal cambia a “Salir sin cerrar el turno” | Figma solo muestra el botón de la opción recomendada. |
| Notificaciones | Ícono de color por tipo (éxito, advertencia, info, neutro), como en C1.4 | El componente “Notificación” usa una campana fija; las pantallas reales no. |

## 9. Pendientes conocidos

- [ ] Conectar `AuthService` y `NotificacionesService` a la API de Laravel (Sanctum); quitar los datos de prueba.
- [ ] El texto de resumen bajo la marca (“Caja 01 · Turno abierto”, “14 órdenes abiertas”…) es fijo en `navegacion.ts`; debe venir de la API.
- [ ] El contador “2” de Mensajes del jefe es fijo; debe venir de la API.
- [ ] Optimizar `assets/acceso/logo-shuri.png` (1.2 MB para un logo de 36 px).
- [ ] Avisos de presupuesto de CSS en `acceso-layout` (2.9 kB) y `menu-lateral` (3.7 kB) contra 2 kB. No rompen la compilación; el límite de error es 4 kB.
- [ ] A.6 Cambiar contraseña y Mi perfil (ya tienen ruta en cada rol).
- [ ] “Ver todas las notificaciones” (pie del panel en Figma) cuando exista su pantalla.
- [ ] Versiones J10 celular (jefe) y T7 tablet (técnico).
- [ ] Bloqueo de sesión tras 30 min sin uso (regla general de Figma).
- [ ] Pantallas de cada rol: inicios de AD1, J1 y T1; resto de la cajera C2–C11.
- [ ] C1.6 Mi perfil y contraseña.
- [ ] El turno de caja simulado no está ligado a la cajera: si entra otra cajera, verá la caja abierta. La API debe decir de quién es el turno.
- [ ] Corte de caja (C10) debe llamar a `CajaService.cerrarTurno()`.
- [ ] Color exacto del fondo atenuado de los modales (se usó marino al 45 %).

---

## 10. Registro de sesiones

### 2 nov 2026 · Acceso del personal (A.1–A.5)
- Se revisó todo el archivo de Figma: 3 páginas (Sistema del personal, Portal del cliente, Componentes y tokens) y las secciones de cada rol.
- Tokens de color de Figma pasados a `styles.css` y fuente Inter en `index.html`.
- Construidas A.1 Iniciar sesión, A.2 Datos incorrectos, A.3/A.4 ¿Olvidaste tu contraseña?, A.5 Crea tu contraseña, con su panel de marca compartido.
- `AuthService` simulado: 3 intentos y bloqueo, contraseña temporal, cambio obligatorio en el primer ingreso.
- Guardas de ruta: `conSesion` y `conContrasenaTemporal`.
- Verificado en el navegador a 1440×900 (posiciones iguales a Figma) y en ancho de celular.

### 2 nov 2026 · Rama al día con `develop`
- Se unió `origin/develop` a `feature/frontend-ui` sin conflictos. Llegaron solo cambios de documentación del equipo: README, `backend/README.md`, `frontend/README.md`, `.gitignore` y la plantilla de PR.
- Tras unirla: `ng build` correcto y login revisado a 360 px sin scroll horizontal.
- Se documentó el flujo de trabajo del equipo (sección 7).

### 2 nov 2026 · Estructura de la app con menú lateral
- Revisados en Figma los menús de los 4 roles, los componentes “Navegación lateral” (184 y 72 px), “Menú de usuario” y “Notificación”, y las pantallas C1.5 y T1.2.
- Nuevo `sistema/`:
  - layout con menú lateral
  - menú de cada rol en `navegacion.ts`
  - menú de usuario (Mi perfil, Cambiar contraseña, Cerrar sesión)
  - panel de notificaciones con pestañas Nuevas/Todas y “Marcar todo como leído”
- Login conectado: cada rol entra a `/<rol>/inicio`. La guarda `soloRol` impide entrar a secciones de otro rol. La guarda `conSesion` se reemplazó por `aSuInicio` y `soloRol`.
- Usuarios de prueba para los 4 roles.
- 27 íconos del menú descargados de Figma a `assets/menu/`.
- Verificado:
  - a 1440×900, con posiciones iguales a Figma
  - a 1366×768: riel de 72 px que se abre al pasar el mouse sin mover el contenido
  - a 360 px: cajón que se cierra al navegar, sin scroll horizontal
  - redirección por rol y cierre de sesión

### 2 nov 2026 · Cajera C1: inicio y apertura de caja
- Revisadas en Figma C1.1–C1.7.
- Construidas:
  - C1.1 inicio con turno abierto y C1.2 con caja cerrada (aviso marino, accesos atenuados, último corte)
  - C1.3 modal de conteo del fondo por denominación, con total en verde o ámbar
  - C1.7 modal al cerrar sesión con el turno abierto
- Integrado en lo existente:
  - C1.4: panel de notificaciones con íconos de color y los avisos de la cajera
  - C1.5: “Turno abierto desde HH:MM” en el menú de usuario
  - El estado del menú lateral cambia entre “Caja 01 · Turno abierto” y “Caja 01 · Caja cerrada” (en rojo claro)
- Nuevo `CajaService` (turno guardado en el navegador) y `compartido/formato.ts`.
- Pasaron a `styles.css` los componentes de Figma Panel, Fila, Indicador KPI, Estado, Tecla, Modal y Botón contorno. El CSS del inicio pasaba el límite de 4 kB.
- Verificado:
  - a 1440×900: posiciones iguales a Figma C1.2 (aviso en y=88, indicadores en y=290, pendientes en y=370)
  - flujo completo: abrir turno → C1.1 → F3 → notificaciones → cerrar sesión → C1.7 → salir sin cerrar → volver a entrar con la caja abierta
  - a 1366×768: cabe sin scroll
  - a 360 px: una columna, modal con scroll interno, sin scroll horizontal
