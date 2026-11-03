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

  subgraph ADM["02 · Administrador"]
    AD["AD1–AD9"]:::pendiente
  end
  subgraph CAJ["03 · Cajera"]
    C["01–11"]:::pendiente
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

  SHELL["Estructura de la app<br/>menú lateral 184 px / riel 72 px"]:::pendiente

  BASE --> ACC
  BASE --> SHELL
  ACC -->|"rol: administrador"| ADM
  ACC -->|"rol: cajera"| CAJ
  ACC -->|"rol: jefe de técnicos"| JEF
  ACC -->|"rol: técnico"| TEC
  SHELL --> ADM & CAJ & JEF & TEC
  SHELL --> A6
  BASE --> POR
```

## 2. Grafo de navegación (rutas actuales)

```mermaid
flowchart TD
  classDef ruta fill:#e7f5f7,stroke:#087f91,color:#17374e
  classDef guarda fill:#fff4dc,stroke:#925d0b,color:#17374e
  classDef temporal fill:#f3f4f6,stroke:#94a3b8,color:#64748b,stroke-dasharray: 4 3

  RAIZ(["/"]) --> LOGIN
  LOGIN["/iniciar-sesion<br/>A.1 · A.2"]:::ruta
  OLV["/olvide-contrasena<br/>A.3 · A.4"]:::ruta
  CREAR["/crear-contrasena<br/>A.5"]:::ruta
  INICIO["/inicio<br/>(provisional)"]:::temporal

  G1{{"conContrasenaTemporal"}}:::guarda
  G2{{"conSesion"}}:::guarda

  LOGIN -->|"¿Olvidaste tu contraseña?"| OLV
  OLV -->|"Volver / Entrar con temporal"| LOGIN
  LOGIN -->|"entra con contraseña temporal"| G1 --> CREAR
  LOGIN -->|"entra con su contraseña"| G2 --> INICIO
  CREAR -->|"Guardar y entrar"| G2
  CREAR -->|"Salir sin guardar"| LOGIN
  INICIO -->|"Cerrar sesión"| LOGIN
```

## 3. Grafo de componentes

```mermaid
flowchart LR
  classDef comp fill:#ffffff,stroke:#087f91,color:#17374e
  classDef serv fill:#e7f5f7,stroke:#087f91,color:#17374e
  classDef css fill:#f9fafb,stroke:#dce2e8,color:#64748b

  APP["AppComponent<br/>router-outlet"]:::comp
  LAY["AccesoLayoutComponent<br/>panel de marca + columna"]:::comp
  IS["IniciarSesionComponent"]:::comp
  OC["OlvideContrasenaComponent"]:::comp
  CC["CrearContrasenaComponent<br/>+ indicador de contraseña"]:::comp
  IP["InicioPendienteComponent"]:::comp
  AUTH["AuthService<br/>(simulado)"]:::serv
  RUT["app.routes.ts<br/>guardas conSesion / conContrasenaTemporal"]:::serv
  GLB["styles.css<br/>tokens + .tarjeta .campo .boton .aviso .casilla .enlace"]:::css

  APP --> RUT
  RUT --> LAY --> IS & OC & CC
  RUT --> IP
  IS & OC & CC & IP --> AUTH
  RUT --> AUTH
  GLB -.-> LAY & IS & OC & CC & IP
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

| Usuario | Contraseña | Resultado |
|---|---|---|
| `amartinez` | `Shuri2026!` | Entra directo (rol cajera) |
| `nuevo` | `temporal123` | Simula primer ingreso → A.5 (rol técnico) |
| cualquier otro | — | A.2: “Te quedan N intentos”; al 3.º fallo la cuenta se bloquea |

## 5. Estructura de carpetas

```
frontend/src/
├── index.html                 # lang="es", fuente Inter (Google Fonts)
├── styles.css                 # tokens de Figma + clases compartidas
├── assets/
│   ├── acceso/                # logo-shuri.png, elipses del panel de marca
│   └── iconos/                # SVG exportados de Figma (nombre = ícono de Figma)
└── app/
    ├── app.routes.ts          # rutas + guardas
    ├── acceso/
    │   ├── auth.service.ts    # sesión, intentos, contraseña temporal (simulado)
    │   ├── acceso-layout/     # marco común A.1–A.5
    │   ├── iniciar-sesion/    # A.1 · A.2
    │   ├── olvide-contrasena/ # A.3 · A.4
    │   └── crear-contrasena/  # A.5 + indicador de seguridad
    └── inicio/
        └── inicio-pendiente.component.ts   # destino temporal tras login
```

## 6. Convenciones

- **Componentes standalone**, `signal()` para estado local, **Reactive Forms** (`NonNullableFormBuilder`), control de flujo nuevo (`@if`, `@for`).
- **Nombres en español** (componentes, clases CSS, variables), igual que en Figma.
- **Colores:** siempre `var(--color-*)` de `styles.css`. Los nombres salen de las variables de Figma (`color/primario` → `--color-primario`).
- **Estilos compartidos en `styles.css`** (`.tarjeta`, `.campo`, `.campo__control`, `.boton--primario`, `.enlace`, `.aviso--error`, `.casilla`). El presupuesto de CSS por componente es 2 kB, así que lo reutilizable va global y lo específico va en el componente.
- **Íconos:** se descargan de Figma a `assets/iconos/` y se usan como `<img>` con su `width`/`height` original. No se redibujan.
- **Reglas de Figma aplicadas** (página “Componentes y tokens › Reglas de comportamiento”):
  - Campo en foco: borde 1.5 px `--color-primario`. Campo con error: borde 1.5 px `--color-peligro`.
  - Validación al salir del campo y al guardar; el mensaje va en rojo debajo del campo.
  - Campos obligatorios con `*`.
- **Responsivo:** base 1440×900, mínimo 360 px de ancho (lo exige el checklist de PR). Debajo de 960 px de ancho se oculta el panel de marca y aparece el logo arriba del formulario. Con menos de 760 px de alto se ocultan las tarjetas flotantes del panel.

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
| Destino tras iniciar sesión | `/inicio` provisional que muestra el rol | Los inicios por rol (AD1.1, C1.1, J1.1, T1.1) aún no existen. |
| Estilos | CSS propio con tokens de Figma, sin Tailwind ni Angular Material | `frontend/README.md` menciona “Tailwind CSS / Angular Material”, pero ninguno está instalado. Con CSS propio se copia el diseño de Figma tal cual. Pendiente acordarlo con el equipo. |

## 9. Pendientes conocidos

- [ ] Conectar `AuthService` a la API de Laravel (Sanctum) cuando exista; quitar los usuarios de prueba.
- [ ] Optimizar `assets/acceso/logo-shuri.png` (1.2 MB para un logo de 48 px).
- [ ] Aviso de presupuesto en `acceso-layout.component.css` (2.9 kB contra 2 kB). No rompe la compilación.
- [ ] Estructura de la app con menú lateral (184 px; riel de 72 px en 1366×768).
- [ ] A.6 Cambiar contraseña (va dentro del sistema, desde el perfil).
- [ ] Redirección por rol: administrador → AD1.1, cajera → C1.1 (o C1.2 sin turno), jefe → J1.1 / J10.1 en celular, técnico → T1.1 / T7.1 en tablet.
- [ ] Bloqueo de sesión tras 30 min sin uso (regla general de Figma).

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
