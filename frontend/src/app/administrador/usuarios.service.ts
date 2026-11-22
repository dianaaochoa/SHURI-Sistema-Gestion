import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { CuentaUsuario, Rol, SesionActiva, SesionActivaApi, Turno, sesionActivaDesdeApi } from '../acceso/auth.service';
import { erroresDeCampos, mensajeDeError } from '../api/errores-api';

/** Empleado como lo responde la API (GET /users, docs/api/endpoints.md §13). */
interface UsuarioApi {
  id: number;
  name: string;
  username: string;
  email: string;
  phone: string | null;
  role: { id: number; slug: string; name: string };
  cash_register: { id: number; name: string } | null;
  shift: 'morning' | 'evening' | 'full_day' | null;
  start_time: string | null;
  end_time: string | null;
  max_discount_pct: number;
  is_active: boolean;
  is_locked: boolean;
  must_change_password: boolean;
  password_help_requested_at: string | null;
  has_security_question: boolean;
  last_login_at: string | null;
}

/** Rol de la API ↔ rol de las pantallas. El super usuario se muestra como administrador. */
const ROL_DE_SLUG: Record<string, Rol> = {
  super_admin: 'administrador',
  admin: 'administrador',
  head_technician: 'jefe-tecnicos',
  technician: 'tecnico',
  cashier: 'cajera',
};
export const ID_DE_ROL: Record<Rol, number> = { administrador: 1, 'jefe-tecnicos': 2, tecnico: 3, cajera: 4 };

const TURNO_DE_API: Record<string, Turno> = { morning: 'Matutino', evening: 'Vespertino' };
const TURNO_A_API: Record<Turno, string> = { Matutino: 'morning', Vespertino: 'evening' };

/** "09:00" → "9:00" */
const horaCorta = (h: string) => h.replace(/^0/, '');
/** "9:00" → "09:00" */
const horaApi = (h: string) => h.trim().padStart(5, '0');

function cuentaDesdeApi(u: UsuarioApi): CuentaUsuario {
  return {
    id: u.id,
    usuario: u.username,
    nombre: u.name,
    rol: ROL_DE_SLUG[u.role.slug] ?? 'cajera',
    puesto: u.role.name,
    telefono: u.phone ?? '',
    correo: u.email,
    caja: u.cash_register?.name,
    cajaId: u.cash_register?.id ?? null,
    turno: u.shift ? TURNO_DE_API[u.shift] : undefined,
    horario: u.start_time && u.end_time ? `${horaCorta(u.start_time)}–${horaCorta(u.end_time)}` : undefined,
    descuentoMaximo: Number(u.max_discount_pct),
    activo: u.is_active,
    temporal: u.must_change_password,
    ultimoAcceso: u.last_login_at ?? undefined,
    bloqueado: u.is_locked,
    pidioAyuda: u.password_help_requested_at,
    tienePregunta: u.has_security_question,
  };
}

/** Lo que captura el formulario de AD7.2. */
export interface DatosUsuario {
  nombre: string;
  usuario: string;
  correo: string;
  telefono: string;
  rol: Rol;
  /** Solo se manda si cambió (nadie puede cambiar su propio rol). */
  cambiaRol: boolean;
  cajaId?: number | null;
  turno?: Turno;
  /** "9:00–18:00" */
  horario?: string;
  descuentoMaximo?: number;
}

/** Resultado de guardar: mensaje, errores por campo (422) y, si aplica, la contraseña temporal. */
export interface ResultadoUsuario {
  ok: boolean;
  mensaje: string;
  errores?: Record<string, string>;
  temporal?: string;
  correoEnviado?: boolean;
}

export interface Caja {
  id: number;
  nombre: string;
}

/** AD7.3 · Permiso del catálogo de la API (fila de la matriz). */
export interface PermisoApi {
  code: string;
  name: string;
  module: string;
}

/** AD7.3 · Permisos actuales de un rol (columna de la matriz). */
export interface RolPermisos {
  id: number;
  rol: Rol;
  nombre: string;
  usuariosActivos: number;
  codigos: string[];
  /** Descuento máximo del permiso pos.discount (la cajera, 0 a 20 %). */
  limiteDescuento: number | null;
}

interface RolApi {
  id: number;
  slug: string;
  name: string;
  active_users: number;
  permissions: { code: string; limit_pct: number | null }[];
}

const rolDesdeApi = (r: RolApi): RolPermisos => ({
  id: r.id,
  rol: ROL_DE_SLUG[r.slug] ?? 'cajera',
  nombre: r.name,
  usuariosActivos: r.active_users,
  codigos: r.permissions.map((p) => p.code),
  limiteDescuento: r.permissions.find((p) => p.code === 'pos.discount')?.limit_pct ?? null,
});

/**
 * AD7 · Usuarios y permisos conectados a la API: alta con contraseña temporal por correo,
 * edición, baja, desbloqueo, control de dispositivos de cada empleado y permisos por rol.
 */
@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly cuentas = signal<CuentaUsuario[]>([]);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly cajas = signal<Caja[]>([]);

  /** Lista de empleados y cajas. */
  cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    forkJoin({
      usuarios: this.http.get<{ data: UsuarioApi[] }>(`${this.api}/users`, { params: { per_page: 100 } }),
      cajas: this.http.get<{ data: { id: number; name: string }[] }>(`${this.api}/cash-registers`).pipe(catchError(() => of({ data: [] }))),
    }).subscribe({
      next: ({ usuarios, cajas }) => {
        this.cuentas.set(usuarios.data.map(cuentaDesdeApi));
        this.cajas.set(cajas.data.map((c) => ({ id: c.id, nombre: c.name })));
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  existe(usuario: string): boolean {
    const u = usuario.trim().toLowerCase();
    return this.cuentas().some((c) => c.usuario === u);
  }

  /** AD7.2 · Alta: la API genera la contraseña temporal, la manda por correo y la devuelve una sola vez. */
  crear(datos: DatosUsuario): Observable<ResultadoUsuario> {
    return this.http
      .post<{ message: string; temporary_password: string; email_sent: boolean }>(`${this.api}/users`, this.cuerpo(datos, true))
      .pipe(
        map((r) => ({ ok: true, mensaje: r.message, temporal: r.temporary_password, correoEnviado: r.email_sent })),
        tap(() => this.cargar()),
        catchError((e) => of(this.fallo(e))),
      );
  }

  /** AD7.2 · Editar (todo es opcional; el usuario no se cambia). */
  editar(id: number, datos: DatosUsuario): Observable<ResultadoUsuario> {
    return this.http.put<{ message: string }>(`${this.api}/users/${id}`, this.cuerpo(datos, false)).pipe(
      map((r) => ({ ok: true, mensaje: r.message })),
      tap(() => this.cargar()),
      catchError((e) => of(this.fallo(e))),
    );
  }

  /** Baja (cierra todas sus sesiones al instante) o reactivación. */
  cambiarActivo(id: number, activo: boolean): Observable<ResultadoUsuario> {
    return this.http.post<{ message: string }>(`${this.api}/users/${id}/${activo ? 'activate' : 'deactivate'}`, {}).pipe(
      map((r) => ({ ok: true, mensaje: r.message })),
      tap(() => this.cargar()),
      catchError((e) => of(this.fallo(e))),
    );
  }

  /** AD7.4 · Contraseña temporal: también desbloquea la cuenta y cierra sus sesiones. */
  asignarTemporal(id: number): Observable<ResultadoUsuario> {
    return this.http
      .post<{ message: string; temporary_password: string; email_sent: boolean }>(`${this.api}/users/${id}/temporary-password`, {})
      .pipe(
        map((r) => ({ ok: true, mensaje: r.message, temporal: r.temporary_password, correoEnviado: r.email_sent })),
        tap(() => this.cargar()),
        catchError((e) => of(this.fallo(e))),
      );
  }

  /** Desbloquear sin cambiar la contraseña. */
  desbloquear(id: number): Observable<ResultadoUsuario> {
    return this.http.post<{ message: string }>(`${this.api}/users/${id}/unlock`, {}).pipe(
      map((r) => ({ ok: true, mensaje: r.message })),
      tap(() => this.cargar()),
      catchError((e) => of(this.fallo(e))),
    );
  }

  // ---------- Control de dispositivos (multisesión) ----------

  sesionesDe(id: number): Observable<SesionActiva[]> {
    return this.http.get<{ data: SesionActivaApi[] }>(`${this.api}/users/${id}/sessions`).pipe(map((r) => r.data.map(sesionActivaDesdeApi)));
  }

  cerrarSesion(id: number, sesionId: number): Observable<ResultadoUsuario> {
    return this.http.delete<{ message: string }>(`${this.api}/users/${id}/sessions/${sesionId}`).pipe(
      map((r) => ({ ok: true, mensaje: r.message })),
      catchError((e) => of(this.fallo(e))),
    );
  }

  cerrarTodas(id: number): Observable<ResultadoUsuario> {
    return this.http.delete<{ message: string }>(`${this.api}/users/${id}/sessions`).pipe(
      map((r) => ({ ok: true, mensaje: r.message })),
      catchError((e) => of(this.fallo(e))),
    );
  }

  // ---------- AD7.3 Permisos por rol ----------

  roles(): Observable<{ roles: RolPermisos[]; permisos: PermisoApi[] }> {
    return this.http.get<{ data: RolApi[]; permissions: PermisoApi[] }>(`${this.api}/roles`).pipe(
      map((r) => ({
        // El rol del super usuario no se edita: siempre tiene todos los permisos
        roles: r.data.filter((x) => x.slug !== 'super_admin').map(rolDesdeApi),
        permisos: r.permissions,
      })),
    );
  }

  guardarRol(rol: RolPermisos, codigos: string[], limiteDescuento: number | null): Observable<ResultadoUsuario> {
    return this.http
      .put<{ message: string }>(`${this.api}/roles/${rol.id}`, { permissions: codigos, discount_limit_pct: limiteDescuento })
      .pipe(
        map((r) => ({ ok: true, mensaje: r.message })),
        catchError((e) => of(this.fallo(e))),
      );
  }

  /** Cuerpo de POST/PUT /users con los nombres de campo de la API. */
  private cuerpo(d: DatosUsuario, esNuevo: boolean): Record<string, unknown> {
    const [inicio, fin] = (d.horario ?? '').split('–');
    const cuerpo: Record<string, unknown> = {
      name: d.nombre,
      email: d.correo,
      phone: d.telefono.replace(/\D/g, '') || null,
      cash_register_id: d.rol === 'cajera' ? (d.cajaId ?? null) : null,
      shift: d.rol === 'cajera' && d.turno ? TURNO_A_API[d.turno] : null,
      start_time: d.rol !== 'cajera' && inicio ? horaApi(inicio) : null,
      end_time: d.rol !== 'cajera' && fin ? horaApi(fin) : null,
    };
    if (d.descuentoMaximo !== undefined) cuerpo['max_discount_pct'] = d.descuentoMaximo;
    if (esNuevo) cuerpo['username'] = d.usuario;
    if (esNuevo || d.cambiaRol) cuerpo['role_id'] = ID_DE_ROL[d.rol];
    return cuerpo;
  }

  private fallo(e: unknown): ResultadoUsuario {
    return { ok: false, mensaje: mensajeDeError(e), errores: erroresDeCampos(e) };
  }
}
