import { Injectable, computed, signal } from '@angular/core';
import { Observable, delay, of } from 'rxjs';

export type Rol = 'administrador' | 'cajera' | 'jefe-tecnicos' | 'tecnico';

export interface Sesion {
  usuario: string;
  nombre: string;
  rol: Rol;
  /** Entró con contraseña temporal: debe crear la suya (A.5) antes de seguir. */
  requiereCambioContrasena: boolean;
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
const USUARIOS_DEMO: Record<string, { contrasena: string; correo: string; sesion: Sesion }> = {
  amartinez: {
    contrasena: 'Shuri2026!',
    correo: 'amartinez@shuri.mx',
    sesion: { usuario: 'amartinez', nombre: 'Ana Martínez', rol: 'cajera', requiereCambioContrasena: false },
  },
  nuevo: {
    contrasena: 'temporal123',
    correo: 'nuevo@shuri.mx',
    sesion: { usuario: 'nuevo', nombre: 'Usuario nuevo', rol: 'tecnico', requiereCambioContrasena: true },
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
      this.guardarSesion(registro.sesion, recordar);
      resultado = { ok: true, sesion: registro.sesion };
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
