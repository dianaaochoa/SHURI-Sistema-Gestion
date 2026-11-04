import { Injectable, signal } from '@angular/core';
import { VentaCobrada } from './venta.service';

/** Clave de `localStorage` para simular la impresora sin papel (C2.15): `localStorage.setItem('shuri.demo.impresora', 'falla')`. */
const DEMO_IMPRESORA = 'shuri.demo.impresora';

/**
 * Conexión a internet (C2.16) e impresora de tickets (C2.15) de la caja.
 * Simulado: la conexión es la del navegador; la impresora "imprime" salvo que se active la falla de prueba.
 * Al conectar el backend, las ventas sin conexión se guardarán en el equipo y se enviarán al reconectar.
 */
@Injectable({ providedIn: 'root' })
export class DispositivosService {
  readonly enLinea = signal(navigator.onLine);
  /** Ventas cobradas sin conexión que faltan por subir. */
  readonly porSincronizar = signal(0);
  /** Cuántas ventas se subieron en la última reconexión (para el aviso). */
  readonly sincronizadas = signal(0);
  /** Para "Reimprimir último ticket" (Ctrl+P). */
  readonly ultimoTicket = signal<VentaCobrada | null>(null);

  constructor() {
    window.addEventListener('online', () => this.reintentarConexion());
    window.addEventListener('offline', () => this.enLinea.set(false));
  }

  /** Botón "Reintentar" del aviso sin conexión. */
  reintentarConexion(): void {
    const enLinea = navigator.onLine;
    this.enLinea.set(enLinea);
    if (enLinea && this.porSincronizar() > 0) {
      this.sincronizadas.set(this.porSincronizar());
      this.porSincronizar.set(0);
    }
  }

  registrarVenta(venta: VentaCobrada): void {
    this.ultimoTicket.set(venta);
    if (!this.enLinea()) this.porSincronizar.update((n) => n + 1);
  }

  /** Devuelve false si la impresora no responde. */
  imprimir(_venta: VentaCobrada): boolean {
    try {
      return localStorage.getItem(DEMO_IMPRESORA) !== 'falla';
    } catch {
      return true;
    }
  }
}
