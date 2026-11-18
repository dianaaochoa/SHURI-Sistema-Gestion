import { Injectable, signal } from '@angular/core';

export interface SesionPortal {
  clienteId: string;
  nombre: string;
  /** Entró con la contraseña temporal: debe crear la suya (P1.4). */
  temporal: boolean;
}

const CLAVE = 'shuri.portal';

/**
 * Sesión del portal del cliente, aparte de la del personal. Vive en un archivo pequeño para que las guardas
 * de las rutas no carguen todo el portal en el paquete inicial.
 */
@Injectable({ providedIn: 'root' })
export class PortalSesion {
  private readonly actual = signal<SesionPortal | null>(leer());
  readonly sesion = this.actual.asReadonly();

  guardar(s: SesionPortal): void {
    this.actual.set(s);
    sessionStorage.setItem(CLAVE, JSON.stringify(s));
  }

  cerrar(): void {
    this.actual.set(null);
    sessionStorage.removeItem(CLAVE);
  }
}

function leer(): SesionPortal | null {
  try {
    const t = sessionStorage.getItem(CLAVE);
    return t ? (JSON.parse(t) as SesionPortal) : null;
  } catch {
    return null;
  }
}
