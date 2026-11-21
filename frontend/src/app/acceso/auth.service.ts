import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, switchMap } from 'rxjs';

import { environment } from '../../environments/environment';
import { mensajeDeError } from '../api/errores-api';
import { borrarToken, guardarToken, leerToken } from '../api/token-api';

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
  correo?: string;
  telefono?: string;
  /** Descuento máximo sin autorización (RF-14). */
  descuentoMaximo?: number;
  /** Permisos de la API (`pos.sell`, `orders.assign`…): muestran u ocultan acciones. */
  permisos?: string[];
  cajaId?: number | null;
  /** Ya configuró su pregunta secreta (sin ella no puede recuperar su contraseña en línea, A.3). */
  tienePregunta?: boolean;
}

/** Un dispositivo con sesión abierta (multisesión, GET /auth/sessions). */
export interface SesionActiva {
  id: number;
  dispositivo: string | null;
  navegador: string | null;
  sistema: string | null;
  ip: string | null;
  /** ISO */
  inicio: string;
  /** ISO: última petición hecha con esa sesión. */
  ultimoUso: string | null;
  /** ISO */
  vence: string | null;
  /** Es la sesión de este navegador (no se puede cerrar desde la lista). */
  actual: boolean;
}

interface SesionActivaApi {
  id: number;
  device_name: string | null;
  browser: string | null;
  platform: string | null;
  ip_address: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_current: boolean;
}

const sesionActivaDesdeApi = (s: SesionActivaApi): SesionActiva => ({
  id: s.id,
  dispositivo: s.device_name,
  navegador: s.browser,
  sistema: s.platform,
  ip: s.ip_address,
  inicio: s.created_at,
  ultimoUso: s.last_used_at,
  vence: s.expires_at,
  actual: s.is_current,
});

/** Pregunta del catálogo de la API (GET /security-questions), para el select. */
export interface PreguntaSecreta {
  clave: string;
  texto: string;
}

/** Pregunta elegida en el select y su respuesta (la API guarda la respuesta cifrada). */
export interface RespuestaSecreta {
  pregunta: string;
  respuesta: string;
}

/** Usuario del personal como lo responde la API (docs/api/endpoints.md §3). */
interface UsuarioApi {
  id: number;
  name: string;
  username: string;
  email: string;
  phone: string | null;
  role: { slug: 'super_admin' | 'admin' | 'head_technician' | 'technician' | 'cashier'; name: string };
  permissions: string[];
  max_discount_pct: number;
  cash_register_id: number | null;
  cash_register: { id: number; name: string } | null;
  must_change_password: boolean;
  has_security_question: boolean;
  last_login_at: string | null;
}

interface RespuestaSesionApi {
  token: string;
  expires_at: string;
  user: UsuarioApi;
}

type RespuestaLoginApi =
  | ({ mfa_required: false } & RespuestaSesionApi)
  | { mfa_required: true; challenge_id: string; expires_at: string; email_hint: string; message: string };

/** Rol de la API → rol de las rutas de Angular. */
const ROLES: Record<UsuarioApi['role']['slug'], Rol> = {
  // El super usuario usa las pantallas del administrador; la API le da todos los permisos
  super_admin: 'administrador',
  admin: 'administrador',
  head_technician: 'jefe-tecnicos',
  technician: 'tecnico',
  cashier: 'cajera',
};

/** Paso del código MFA: la contraseña fue correcta y se mandó un código por correo. */
export interface RetoMfa {
  retoId: string;
  /** Correo enmascarado (c*****@shuri.mx). */
  correo: string;
  mensaje: string;
}

/** Recuperar contraseña (A.3): la pregunta secreta de la cuenta. */
export type InicioRecuperacion = { ok: true; recuperacionId: string; pregunta: string } | { ok: false; mensaje: string };

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
  | { ok: false; mensaje: string; mfa?: undefined }
  | { ok: false; mfa: RetoMfa; mensaje: string };

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

export const CLAVE_SESION = 'shuri.sesion';
/** Último uso de la app (ms) y pantalla bloqueada por inactividad; compartidos entre pestañas. */
export const CLAVE_ACTIVIDAD = 'shuri.actividad';
export const CLAVE_BLOQUEO = 'shuri.bloqueada';
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

/** Convierte el usuario de la API en la sesión que usan las pantallas y los guards. */
function sesionDesdeApi(u: UsuarioApi, desde = new Date().toISOString()): Sesion {
  const rol = ROLES[u.role.slug];
  // Segunda línea del menú lateral: "Super usuario", "Cajera · Caja 01", "Técnico · Taller"
  const puesto =
    rol === 'cajera' ? `${u.role.name} · ${u.cash_register?.name ?? 'Sin caja'}` : rol === 'tecnico' ? `${u.role.name} · Taller` : u.role.name;

  return {
    usuario: u.username,
    nombre: u.name,
    rol,
    puesto,
    requiereCambioContrasena: u.must_change_password,
    desde,
    correo: u.email,
    telefono: u.phone ?? '',
    descuentoMaximo: Number(u.max_discount_pct),
    permisos: u.permissions,
    cajaId: u.cash_register_id,
    tienePregunta: u.has_security_question,
  };
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

  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  /**
   * Contraseña con la que entró, solo en memoria y solo mientras sea temporal:
   * la API la pide como "actual" para crear la propia (A.5). Nunca se guarda en el navegador.
   */
  private contrasenaTemporal: string | null = null;
  /** "Recordar este equipo" elegido en el login, para guardar el token al validar el código MFA. */
  private recordarAlEntrar = false;

  constructor() {
    if (this.sesionActual() && !leerToken('personal')) {
      // Sesión de antes de conectar la API (o de otro navegador): sin token no sirve
      this.limpiarSesion();
    } else if (this.sesionActual()) {
      // Al recargar la página se actualizan permisos y datos; si el token venció, el interceptor regresa al acceso
      this.http.get<{ data: UsuarioApi }>(`${this.api}/auth/me`).subscribe({
        // Sin marcar uso: recargar la página no debe quitar el bloqueo por inactividad
        next: ({ data }) => this.guardarSesion(sesionDesdeApi(data, this.sesionActual()?.desde), this.estaRecordada(), false),
        error: () => undefined,
      });
    }
  }

  /** A.1 Iniciar sesión. Si aplica MFA, el resultado trae el reto para pedir el código (A.1b). */
  iniciarSesion(usuario: string, contrasena: string, recordar: boolean): Observable<ResultadoInicioSesion> {
    this.recordarAlEntrar = recordar;

    return this.http.post<RespuestaLoginApi>(`${this.api}/auth/login`, { login: usuario.trim(), password: contrasena }).pipe(
      map((r): ResultadoInicioSesion => {
        this.contrasenaTemporal = contrasena;
        if (r.mfa_required) {
          return { ok: false, mensaje: r.message, mfa: { retoId: r.challenge_id, correo: r.email_hint, mensaje: r.message } };
        }
        return this.abrirSesion(r, recordar);
      }),
      catchError((error) => of<ResultadoInicioSesion>({ ok: false, mensaje: mensajeDeError(error) })),
    );
  }

  /** A.1b Segundo paso: el código de 6 dígitos que llegó por correo. */
  verificarCodigo(retoId: string, codigo: string): Observable<ResultadoInicioSesion> {
    return this.http.post<RespuestaSesionApi>(`${this.api}/auth/2fa/verify`, { challenge_id: retoId, code: codigo }).pipe(
      map((r) => this.abrirSesion(r, this.recordarAlEntrar)),
      catchError((error) => of<ResultadoInicioSesion>({ ok: false, mensaje: mensajeDeError(error) })),
    );
  }

  /** Manda un código nuevo (máximo uno por minuto). */
  reenviarCodigo(retoId: string): Observable<{ ok: boolean; mensaje: string }> {
    return this.http.post<{ message: string }>(`${this.api}/auth/2fa/resend`, { challenge_id: retoId }).pipe(
      map((r) => ({ ok: true, mensaje: r.message })),
      catchError((error) => of({ ok: false, mensaje: mensajeDeError(error) })),
    );
  }

  /** A.3 Paso 1: la pregunta secreta de la cuenta. Si no tiene, la API indica pedirla al administrador. */
  iniciarRecuperacion(usuario: string): Observable<InicioRecuperacion> {
    type Respuesta = { requires_answer: true; recovery_id: string; security_question: string } | { requires_answer: false; message: string };

    return this.http.post<Respuesta>(`${this.api}/auth/password/forgot`, { login: usuario.trim() }).pipe(
      map((r): InicioRecuperacion => (r.requires_answer ? { ok: true, recuperacionId: r.recovery_id, pregunta: r.security_question } : { ok: false, mensaje: r.message })),
      catchError((error) => of<InicioRecuperacion>({ ok: false, mensaje: mensajeDeError(error) })),
    );
  }

  /** A.3 Paso 2 → A.4: si la respuesta es correcta, llega una contraseña temporal al correo. */
  responderPregunta(recuperacionId: string, respuesta: string): Observable<{ ok: true; correo: string } | { ok: false; mensaje: string }> {
    return this.http.post<{ email_hint: string }>(`${this.api}/auth/password/answer`, { recovery_id: recuperacionId, answer: respuesta }).pipe(
      map((r) => ({ ok: true as const, correo: r.email_hint })),
      catchError((error) => of({ ok: false as const, mensaje: mensajeDeError(error) })),
    );
  }

  /**
   * A.5 Primer ingreso: configura su pregunta secreta y crea su contraseña.
   * Primero la pregunta (la API pide la temporal con la que entró) y después la contraseña:
   * si algo falla, puede volver a intentarlo con la misma temporal.
   */
  crearContrasena(nueva: string, secreta: RespuestaSecreta): Observable<{ ok: boolean; mensaje?: string }> {
    const temporal = this.contrasenaTemporal;
    if (!temporal) {
      return of({ ok: false, mensaje: 'Por seguridad, vuelve a iniciar sesión con tu contraseña temporal.' });
    }

    return this.guardarPregunta(temporal, secreta).pipe(
      switchMap((pregunta) => (pregunta.ok ? this.cambiarEnApi(temporal, nueva) : of(pregunta))),
      map((r) => {
        const sesion = this.sesionActual();
        if (r.ok && sesion) {
          this.contrasenaTemporal = null;
          this.guardarSesion({ ...sesion, requiereCambioContrasena: false, tienePregunta: true }, this.estaRecordada());
        }
        return r;
      }),
    );
  }

  /** C1.6 · Mis sesiones: dispositivos con sesión abierta (la actual primero). */
  sesionesActivas(): Observable<SesionActiva[]> {
    return this.http.get<{ data: SesionActivaApi[] }>(`${this.api}/auth/sessions`).pipe(
      map((r) => r.data.map(sesionActivaDesdeApi).sort((a, b) => Number(b.actual) - Number(a.actual))),
    );
  }

  /** Cierra la sesión de otro dispositivo (ese equipo vuelve al inicio de sesión). */
  cerrarSesionRemota(id: number): Observable<{ ok: boolean; mensaje: string }> {
    return this.http.delete<{ message: string }>(`${this.api}/auth/sessions/${id}`).pipe(
      map((r) => ({ ok: true, mensaje: r.message })),
      catchError((error) => of({ ok: false, mensaje: mensajeDeError(error) })),
    );
  }

  /** Cierra todas las sesiones menos la de este navegador. */
  cerrarOtrasSesiones(): Observable<{ ok: boolean; mensaje: string }> {
    return this.http.delete<{ message: string }>(`${this.api}/auth/sessions`).pipe(
      map((r) => ({ ok: true, mensaje: r.message })),
      catchError((error) => of({ ok: false, mensaje: mensajeDeError(error) })),
    );
  }

  /** Catálogo de preguntas para el select. */
  preguntasSecretas(): Observable<PreguntaSecreta[]> {
    return this.http.get<{ data: { key: string; text: string }[] }>(`${this.api}/security-questions`).pipe(
      map((r) => r.data.map((p) => ({ clave: p.key, texto: p.text }))),
      catchError(() => of([])),
    );
  }

  /** C1.6 · Configurar o cambiar la pregunta secreta (pide la contraseña actual). */
  guardarPregunta(contrasenaActual: string, secreta: RespuestaSecreta): Observable<{ ok: boolean; mensaje?: string }> {
    return this.http
      .put<{ message: string }>(`${this.api}/auth/security-question`, {
        current_password: contrasenaActual,
        question: secreta.pregunta,
        answer: secreta.respuesta.trim(),
      })
      .pipe(
        map((r) => {
          const sesion = this.sesionActual();
          if (sesion) this.guardarSesion({ ...sesion, tienePregunta: true }, this.estaRecordada(), false);
          return { ok: true, mensaje: r.message };
        }),
        catchError((error) => of({ ok: false, mensaje: mensajeDeError(error) })),
      );
  }

  /** Datos de la cuenta con sesión abierta (C1.6). */
  perfil(): Perfil | null {
    const s = this.sesionActual();
    return s ? { usuario: s.usuario, telefono: s.telefono ?? '', correo: s.correo ?? '', descuentoMaximo: s.descuentoMaximo } : null;
  }

  /** C1.6 · Cambiar contraseña: pide la actual. La API cierra las sesiones en otros equipos. */
  cambiarContrasena(actual: string, nueva: string): Observable<{ ok: boolean; mensaje?: string }> {
    return this.cambiarEnApi(actual, nueva);
  }

  private cambiarEnApi(actual: string, nueva: string): Observable<{ ok: boolean; mensaje?: string }> {
    return this.http
      .put<{ message: string }>(`${this.api}/auth/password`, { current_password: actual, password: nueva, password_confirmation: nueva })
      .pipe(
        map((r) => ({ ok: true, mensaje: r.message })),
        catchError((error) => of({ ok: false, mensaje: mensajeDeError(error) })),
      );
  }

  /** Guarda el token y la sesión que respondió la API. */
  private abrirSesion(r: RespuestaSesionApi, recordar: boolean): ResultadoInicioSesion {
    const sesion = sesionDesdeApi(r.user);
    if (!sesion.requiereCambioContrasena) this.contrasenaTemporal = null;
    guardarToken('personal', r.token, recordar);
    this.guardarSesion(sesion, recordar);
    return { ok: true, sesion };
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

  /** Cierra la sesión en la API (revoca el token) y en este navegador. */
  cerrarSesion(): void {
    if (leerToken('personal')) {
      // Se manda antes de borrar el token: el interceptor lo agrega al enviar la petición
      this.http.post(`${this.api}/auth/logout`, {}).subscribe({ error: () => undefined });
    }
    this.limpiarSesion();
  }

  /**
   * Pantalla bloqueada tras 30 min sin uso: la misma persona confirma su contraseña
   * y sigue con la sesión que ya tenía (no abre otra ni pide código MFA).
   */
  desbloquear(contrasena: string): Observable<ResultadoInicioSesion> {
    const sesion = this.sesionActual();
    if (!sesion) return of<ResultadoInicioSesion>({ ok: false, mensaje: 'Tu sesión terminó. Vuelve a iniciar sesión.' });

    return this.http.post(`${this.api}/auth/confirm-password`, { password: contrasena }).pipe(
      map((): ResultadoInicioSesion => {
        this.guardarSesion(sesion, this.estaRecordada());
        return { ok: true, sesion };
      }),
      catchError((error) => of<ResultadoInicioSesion>({ ok: false, mensaje: mensajeDeError(error) })),
    );
  }

  private limpiarSesion(): void {
    this.sesionActual.set(null);
    this.contrasenaTemporal = null;
    borrarToken('personal');
    localStorage.removeItem(CLAVE_SESION);
    sessionStorage.removeItem(CLAVE_SESION);
    localStorage.removeItem(CLAVE_ACTIVIDAD);
    localStorage.removeItem(CLAVE_BLOQUEO);
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

  /** @param marcarUso entrar o desbloquear cuenta como uso; refrescar los datos al recargar, no. */
  private guardarSesion(sesion: Sesion, recordar: boolean, marcarUso = true): void {
    this.sesionActual.set(sesion);
    const almacen = recordar ? localStorage : sessionStorage;
    (recordar ? sessionStorage : localStorage).removeItem(CLAVE_SESION);
    almacen.setItem(CLAVE_SESION, JSON.stringify(sesion));
    if (marcarUso) {
      // La pantalla queda libre otros 30 min.
      localStorage.setItem(CLAVE_ACTIVIDAD, String(Date.now()));
      localStorage.removeItem(CLAVE_BLOQUEO);
    }
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
