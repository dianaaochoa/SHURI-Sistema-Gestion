import { Injectable, computed, signal } from '@angular/core';
import { Observable, delay, of } from 'rxjs';

export type Rol = 'administrador' | 'cajera' | 'jefe-tecnicos' | 'tecnico';

export interface Sesion {
  usuario: string;
  nombre: string;
  rol: Rol;
  /** Segunda línea bajo el nombre en el menú lateral (p. ej. "Cajera · Caja 01"). */
  puesto: string;
  /** Entró con contraseña temporal: debe crear la suya (A.5) antes de seguir. */
  requiereCambioContrasena: boolean;
  /** ISO: cuándo inició sesión en este equipo (C1.6 "Último acceso"). */
  desde?: string;
}

/** Datos de "Mi perfil" (C1.6). Solo el administrador puede cambiarlos. */
export interface Perfil {
  usuario: string;
  telefono: string;
  correo: string;
  /** Descuento máximo que puede aplicar en Punto de venta (solo cajeras). */
  descuentoMaximo?: number;
}

export type ResultadoInicioSesion =
  | { ok: true; sesion: Sesion }
  | { ok: false; mensaje: string };

export type Turno = 'Matutino' | 'Vespertino';

/** Cuenta del personal (AD7). La contraseña nunca sale del servicio. */
export interface CuentaUsuario {
  usuario: string;
  nombre: string;
  rol: Rol;
  /** Cómo se muestra el rol (p. ej. "Administradora", "Cajero"); lo elige el administrador. */
  puesto: string;
  telefono: string;
  correo: string;
  /** Cajeras: caja y turno asignados. */
  caja?: string;
  turno?: Turno;
  /** Técnicos y jefe: horario del taller ("9:00–18:00"). */
  horario?: string;
  /** Descuento máximo que puede aplicar en Punto de venta (solo cajeras). */
  descuentoMaximo?: number;
  activo: boolean;
  /** Tiene contraseña temporal: debe crear la suya (A.5) al entrar. */
  temporal: boolean;
  /** ISO */
  ultimoAcceso?: string;
}

/** Pedido de "¿Olvidaste tu contraseña?" (A.3) que ve el administrador en AD7. */
export interface SolicitudContrasena {
  usuario: string;
  /** ISO */
  fecha: string;
}

interface Registro extends CuentaUsuario {
  contrasena: string;
}

const CLAVE_SESION = 'shuri.sesion';
const INTENTOS_PERMITIDOS = 3;

const haceDias = (hora: string, dias = 0) => {
  const [h, m] = hora.split(':').map(Number);
  const d = new Date();
  d.setDate(d.getDate() - dias);
  d.setHours(h, m, 0, 0);
  // Antes de esa hora del día, el dato de prueba es de ayer (no puede ser futuro).
  if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1);
  return d.toISOString();
};

/**
 * Usuarios de prueba mientras no exista la API de Laravel (Figma AD7.1).
 * Al conectar el backend se reemplazan las llamadas simuladas por HttpClient.
 */
function usuariosDemo(): Record<string, Registro> {
  const lista: Registro[] = [
    { usuario: 'vcastillo', contrasena: 'Shuri2026!', nombre: 'Verónica Castillo', rol: 'administrador', puesto: 'Administradora', correo: 'vcastillo@shuri.mx', telefono: '55 4433 1100', activo: true, temporal: false, ultimoAcceso: haceDias('08:40') },
    { usuario: 'amartinez', contrasena: 'Shuri2026!', nombre: 'Ana Martínez', rol: 'cajera', puesto: 'Cajera', correo: 'amartinez@shuri.mx', telefono: '55 4433 2211', caja: 'Caja 01', turno: 'Matutino', descuentoMaximo: 10, activo: true, temporal: false, ultimoAcceso: haceDias('08:55') },
    { usuario: 'lpena', contrasena: 'Shuri2026!', nombre: 'Luis Peña', rol: 'cajera', puesto: 'Cajero', correo: 'lpena@shuri.mx', telefono: '55 4433 6677', caja: 'Caja 01', turno: 'Vespertino', descuentoMaximo: 10, activo: true, temporal: false, ultimoAcceso: haceDias('21:05', 1) },
    { usuario: 'jlopez', contrasena: 'Shuri2026!', nombre: 'Jorge López', rol: 'jefe-tecnicos', puesto: 'Jefe de técnicos', correo: 'jlopez@shuri.mx', telefono: '55 4433 3322', horario: '9:00–18:00', activo: true, temporal: false, ultimoAcceso: haceDias('09:02') },
    { usuario: 'cruiz', contrasena: 'Shuri2026!', nombre: 'Carlos Ruiz', rol: 'tecnico', puesto: 'Técnico', correo: 'cruiz@shuri.mx', telefono: '55 4433 4433', horario: '9:00–18:00', activo: true, temporal: false, ultimoAcceso: haceDias('09:05') },
    { usuario: 'mvega', contrasena: 'Shuri2026!', nombre: 'Mariana Vega', rol: 'tecnico', puesto: 'Técnico', correo: 'mvega@shuri.mx', telefono: '55 4433 7788', horario: '9:00–18:00', activo: true, temporal: false, ultimoAcceso: haceDias('09:10') },
    // Primer ingreso: entra con la temporal y crea su contraseña (A.5).
    { usuario: 'lortega', contrasena: 'temporal123', nombre: 'Luis Ortega', rol: 'tecnico', puesto: 'Técnico', correo: 'lortega@shuri.mx', telefono: '55 4433 5544', horario: '10:00–19:00', activo: true, temporal: true },
    { usuario: 'rsanchez', contrasena: 'Shuri2026!', nombre: 'Raúl Sánchez', rol: 'tecnico', puesto: 'Técnico', correo: 'rsanchez@shuri.mx', telefono: '55 4433 8899', horario: '9:00–18:00', activo: false, temporal: false, ultimoAcceso: haceDias('18:00', 41) },
  ];
  return Object.fromEntries(lista.map((r) => [r.usuario, r]));
}

/** Segunda línea del menú lateral: "Cajera · Caja 01", "Técnico · Taller". */
function puestoSesion(r: CuentaUsuario): string {
  if (r.rol === 'cajera') return `${r.puesto} · ${r.caja ?? 'Caja 01'}`;
  if (r.rol === 'tecnico') return `${r.puesto} · Taller`;
  return r.puesto;
}

function sinContrasena(r: Registro): CuentaUsuario {
  const { contrasena: _contrasena, ...cuenta } = r;
  return cuenta;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly registros = signal<Record<string, Registro>>(usuariosDemo());
  private readonly intentosFallidos = signal<Record<string, number>>({});
  private readonly sesionActual = signal<Sesion | null>(this.leerSesionGuardada());

  readonly sesion = this.sesionActual.asReadonly();
  readonly autenticado = computed(() => this.sesionActual() !== null);

  /** AD7 · Cuentas del personal, sin contraseñas. */
  readonly usuarios = computed(() => Object.values(this.registros()).map(sinContrasena));
  /** Usuarios bloqueados por intentos fallidos. */
  readonly bloqueados = computed(() => Object.entries(this.intentosFallidos()).filter(([, n]) => n >= INTENTOS_PERMITIDOS).map(([u]) => u));
  /** Pedidos de contraseña nueva pendientes (el más reciente primero). */
  readonly solicitudes = signal<SolicitudContrasena[]>([{ usuario: 'amartinez', fecha: haceDias('10:38') }]);

  iniciarSesion(usuario: string, contrasena: string, recordar: boolean): Observable<ResultadoInicioSesion> {
    const clave = usuario.trim().toLowerCase();
    const registro = this.registros()[clave];
    const intentos = this.intentosFallidos()[clave] ?? 0;

    let resultado: ResultadoInicioSesion;
    if (intentos >= INTENTOS_PERMITIDOS) {
      resultado = { ok: false, mensaje: 'Tu cuenta está bloqueada por seguridad. Pide al administrador que la desbloquee.' };
    } else if (registro && registro.contrasena === contrasena && !registro.activo) {
      resultado = { ok: false, mensaje: 'Tu usuario está desactivado. Habla con el administrador.' };
    } else if (registro && registro.contrasena === contrasena) {
      this.reiniciarIntentos(clave);
      this.actualizar(clave, { ultimoAcceso: new Date().toISOString() });
      const sesion: Sesion = { usuario: clave, nombre: registro.nombre, rol: registro.rol, puesto: puestoSesion(registro), requiereCambioContrasena: registro.temporal, desde: new Date().toISOString() };
      this.guardarSesion(sesion, recordar);
      resultado = { ok: true, sesion };
    } else {
      const restantes = INTENTOS_PERMITIDOS - (intentos + 1);
      this.intentosFallidos.update((m) => ({ ...m, [clave]: intentos + 1 }));
      resultado = {
        ok: false,
        mensaje:
          restantes > 0
            ? `Usuario o contraseña incorrectos. Te ${restantes === 1 ? 'queda 1 intento' : `quedan ${restantes} intentos`} antes de que la cuenta se bloquee.`
            : 'Usuario o contraseña incorrectos. Tu cuenta se bloqueó por seguridad; pide al administrador que la desbloquee.',
      };
    }
    return of(resultado).pipe(delay(500));
  }

  /** Envía una contraseña temporal al correo del usuario y devuelve el correo enmascarado; el administrador ve el pedido (AD7). */
  solicitarContrasenaTemporal(usuario: string): Observable<string> {
    const clave = usuario.trim().toLowerCase();
    const registro = this.registros()[clave];
    if (registro) this.solicitudes.update((lista) => [{ usuario: clave, fecha: new Date().toISOString() }, ...lista.filter((s) => s.usuario !== clave)]);
    const correo = registro?.correo ?? `${usuario.trim()}@shuri.mx`;
    return of(enmascararCorreo(correo)).pipe(delay(500));
  }

  crearContrasena(nueva: string): Observable<void> {
    const sesion = this.sesionActual();
    if (sesion) {
      this.actualizar(sesion.usuario, { contrasena: nueva, temporal: false });
      this.guardarSesion({ ...sesion, requiereCambioContrasena: false }, this.estaRecordada());
    }
    return of(undefined).pipe(delay(500));
  }

  /** Datos de la cuenta con sesión abierta (C1.6). */
  perfil(): Perfil | null {
    const sesion = this.sesionActual();
    const registro = sesion ? this.registros()[sesion.usuario] : undefined;
    return registro ? { usuario: registro.usuario, telefono: registro.telefono, correo: registro.correo, descuentoMaximo: registro.descuentoMaximo } : null;
  }

  /** C1.6 · Cambiar contraseña: pide la actual. Al cambiarla se cerrarían las sesiones en otros equipos (API). */
  cambiarContrasena(actual: string, nueva: string): Observable<{ ok: boolean; mensaje?: string }> {
    const sesion = this.sesionActual();
    const registro = sesion ? this.registros()[sesion.usuario] : undefined;
    if (!registro || registro.contrasena !== actual) return of({ ok: false, mensaje: 'La contraseña actual no es correcta.' }).pipe(delay(400));
    this.actualizar(registro.usuario, { contrasena: nueva });
    return of({ ok: true }).pipe(delay(400));
  }

  // ---------- Administración de usuarios (AD7) ----------

  existe(usuario: string): boolean {
    return !!this.registros()[usuario.trim().toLowerCase()];
  }

  /** AD7.2 · Alta con contraseña temporal: deberá crear la suya en su primer acceso. */
  crearUsuario(cuenta: Omit<CuentaUsuario, 'activo' | 'temporal' | 'ultimoAcceso'>, temporal: string): void {
    const clave = cuenta.usuario.trim().toLowerCase();
    this.registros.update((r) => ({ ...r, [clave]: { ...cuenta, usuario: clave, contrasena: temporal, activo: true, temporal: true } }));
  }

  /** Editar datos, rol, caja u horario, descuento o activar/desactivar (no la contraseña). */
  editarUsuario(usuario: string, cambios: Partial<Omit<CuentaUsuario, 'usuario' | 'temporal' | 'ultimoAcceso'>>): void {
    this.actualizar(usuario, cambios);
  }

  /** AD7.4 · Contraseña temporal entregada en persona; puede desbloquear la cuenta. */
  asignarTemporal(usuario: string, temporal: string, desbloquear: boolean): void {
    this.actualizar(usuario, { contrasena: temporal, temporal: true });
    if (desbloquear) this.reiniciarIntentos(usuario);
    this.solicitudes.update((lista) => lista.filter((s) => s.usuario !== usuario));
  }

  cerrarSesion(): void {
    this.sesionActual.set(null);
    localStorage.removeItem(CLAVE_SESION);
    sessionStorage.removeItem(CLAVE_SESION);
  }

  private actualizar(usuario: string, cambios: Partial<Registro>): void {
    this.registros.update((r) => (r[usuario] ? { ...r, [usuario]: { ...r[usuario], ...cambios } } : r));
  }

  private reiniciarIntentos(usuario: string): void {
    this.intentosFallidos.update((m) => {
      const resto = { ...m };
      delete resto[usuario];
      return resto;
    });
  }

  private guardarSesion(sesion: Sesion, recordar: boolean): void {
    this.sesionActual.set(sesion);
    const almacen = recordar ? localStorage : sessionStorage;
    (recordar ? sessionStorage : localStorage).removeItem(CLAVE_SESION);
    almacen.setItem(CLAVE_SESION, JSON.stringify(sesion));
  }

  private estaRecordada(): boolean {
    return localStorage.getItem(CLAVE_SESION) !== null;
  }

  private leerSesionGuardada(): Sesion | null {
    const guardada = localStorage.getItem(CLAVE_SESION) ?? sessionStorage.getItem(CLAVE_SESION);
    try {
      return guardada ? (JSON.parse(guardada) as Sesion) : null;
    } catch {
      return null;
    }
  }
}

/** am••••••@shuri.mx */
function enmascararCorreo(correo: string): string {
  const [nombre, dominio] = correo.split('@');
  return `${nombre.slice(0, 2)}${'•'.repeat(Math.max(nombre.length - 2, 3))}@${dominio}`;
}
