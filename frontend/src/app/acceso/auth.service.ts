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

const CLAVE_SESION = 'shuri.sesion';
const INTENTOS_PERMITIDOS = 3;

/**
 * Usuarios de prueba mientras no exista la API de Laravel.
 * Al conectar el backend se reemplazan las llamadas simuladas por HttpClient.
 */
const USUARIOS_DEMO: Record<string, { contrasena: string; correo: string; telefono: string; descuentoMaximo?: number; sesion: Sesion }> = {
  vcastillo: {
    contrasena: 'Shuri2026!',
    correo: 'vcastillo@shuri.mx',
    telefono: '55 4433 1100',
    sesion: { usuario: 'vcastillo', nombre: 'Verónica Castillo', rol: 'administrador', puesto: 'Administradora', requiereCambioContrasena: false },
  },
  amartinez: {
    contrasena: 'Shuri2026!',
    correo: 'amartinez@shuri.mx',
    telefono: '55 4433 2211', descuentoMaximo: 10,
    sesion: { usuario: 'amartinez', nombre: 'Ana Martínez', rol: 'cajera', puesto: 'Cajera · Caja 01', requiereCambioContrasena: false },
  },
  jlopez: {
    contrasena: 'Shuri2026!',
    correo: 'jlopez@shuri.mx',
    telefono: '55 4433 3322',
    sesion: { usuario: 'jlopez', nombre: 'Jorge López', rol: 'jefe-tecnicos', puesto: 'Jefe de técnicos', requiereCambioContrasena: false },
  },
  cruiz: {
    contrasena: 'Shuri2026!',
    correo: 'cruiz@shuri.mx',
    telefono: '55 4433 4433',
    sesion: { usuario: 'cruiz', nombre: 'Carlos Ruiz', rol: 'tecnico', puesto: 'Técnico · Taller', requiereCambioContrasena: false },
  },
  nuevo: {
    contrasena: 'temporal123',
    correo: 'nuevo@shuri.mx',
    telefono: '55 4433 5544',
    sesion: { usuario: 'nuevo', nombre: 'Usuario nuevo', rol: 'tecnico', puesto: 'Técnico · Taller', requiereCambioContrasena: true },
  },
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly intentosFallidos = new Map<string, number>();
  private readonly sesionActual = signal<Sesion | null>(this.leerSesionGuardada());

  readonly sesion = this.sesionActual.asReadonly();
  readonly autenticado = computed(() => this.sesionActual() !== null);

  iniciarSesion(usuario: string, contrasena: string, recordar: boolean): Observable<ResultadoInicioSesion> {
    const clave = usuario.trim().toLowerCase();
    const registro = USUARIOS_DEMO[clave];
    const intentos = this.intentosFallidos.get(clave) ?? 0;

    let resultado: ResultadoInicioSesion;
    if (intentos >= INTENTOS_PERMITIDOS) {
      resultado = { ok: false, mensaje: 'Tu cuenta está bloqueada por seguridad. Pide al administrador que la desbloquee.' };
    } else if (registro && registro.contrasena === contrasena) {
      this.intentosFallidos.delete(clave);
      const sesion = { ...registro.sesion, desde: new Date().toISOString() };
      this.guardarSesion(sesion, recordar);
      resultado = { ok: true, sesion };
    } else {
      const restantes = INTENTOS_PERMITIDOS - (intentos + 1);
      this.intentosFallidos.set(clave, intentos + 1);
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

  /** Envía una contraseña temporal al correo del usuario y devuelve el correo enmascarado. */
  solicitarContrasenaTemporal(usuario: string): Observable<string> {
    const correo = USUARIOS_DEMO[usuario.trim().toLowerCase()]?.correo ?? `${usuario.trim()}@shuri.mx`;
    return of(enmascararCorreo(correo)).pipe(delay(500));
  }

  crearContrasena(nueva: string): Observable<void> {
    const sesion = this.sesionActual();
    if (sesion) {
      const registro = USUARIOS_DEMO[sesion.usuario];
      if (registro) registro.contrasena = nueva;
      this.guardarSesion({ ...sesion, requiereCambioContrasena: false }, this.estaRecordada());
    }
    return of(undefined).pipe(delay(500));
  }

  /** Datos de la cuenta con sesión abierta (C1.6). */
  perfil(): Perfil | null {
    const sesion = this.sesionActual();
    const registro = sesion ? USUARIOS_DEMO[sesion.usuario] : undefined;
    return registro ? { usuario: sesion!.usuario, telefono: registro.telefono, correo: registro.correo, descuentoMaximo: registro.descuentoMaximo } : null;
  }

  /** C1.6 · Cambiar contraseña: pide la actual. Al cambiarla se cerrarían las sesiones en otros equipos (API). */
  cambiarContrasena(actual: string, nueva: string): Observable<{ ok: boolean; mensaje?: string }> {
    const registro = this.sesionActual() ? USUARIOS_DEMO[this.sesionActual()!.usuario] : undefined;
    if (!registro || registro.contrasena !== actual) return of({ ok: false, mensaje: 'La contraseña actual no es correcta.' }).pipe(delay(400));
    registro.contrasena = nueva;
    return of({ ok: true }).pipe(delay(400));
  }

  cerrarSesion(): void {
    this.sesionActual.set(null);
    localStorage.removeItem(CLAVE_SESION);
    sessionStorage.removeItem(CLAVE_SESION);
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
