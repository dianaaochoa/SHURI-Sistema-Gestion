import { Injectable, computed, signal } from '@angular/core';
import { VentaCobrada } from './venta.service';

/** Clave de `localStorage` para simular la impresora sin papel (C2.15): `localStorage.setItem('shuri.demo.impresora', 'falla')`. */
const DEMO_IMPRESORA = 'shuri.demo.impresora';
/** Ventas cobradas sin conexión, guardadas en el equipo hasta que vuelva el internet (C2.16). */
const CLAVE_SIN_CONEXION = 'shuri.ventas-sin-conexion';

/** Venta cobrada sin conexión que espera subirse. */
export interface VentaSinConexion {
  venta: VentaCobrada;
  cajera: string;
  /** ISO */
  fecha: string;
}

function leerCola(): VentaSinConexion[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_SIN_CONEXION) ?? '[]') as VentaSinConexion[];
  } catch {
    return [];
  }
}

/**
 * Conexión a internet (C2.16) e impresora de tickets (C2.15) de la caja.
 * Simulado: la conexión es la del navegador; la impresora "imprime" salvo que se active la falla de prueba.
 * Las ventas sin conexión se guardan en el equipo (localStorage) y se suben al reconectar; si se recarga la página
 * antes, Ventas las vuelve a leer de ahí. Con la API, “subir” será enviarlas al servidor.
 */
@Injectable({ providedIn: 'root' })
export class DispositivosService {
  readonly enLinea = signal(navigator.onLine);
  /** Ventas cobradas sin conexión que faltan por subir (guardadas en el equipo). */
  readonly sinConexion = signal<VentaSinConexion[]>(leerCola());
  readonly porSincronizar = computed(() => this.sinConexion().length);
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
      this.guardarCola([]);
    }
  }

  registrarVenta(venta: VentaCobrada, cajera = ''): void {
    this.ultimoTicket.set(venta);
    if (!this.enLinea()) this.guardarCola([...this.sinConexion(), { venta, cajera, fecha: new Date().toISOString() }]);
  }

  private guardarCola(cola: VentaSinConexion[]): void {
    this.sinConexion.set(cola);
    try {
      if (cola.length) localStorage.setItem(CLAVE_SIN_CONEXION, JSON.stringify(cola));
      else localStorage.removeItem(CLAVE_SIN_CONEXION);
    } catch {
      // Sin almacenamiento (modo privado): quedan solo en memoria.
    }
  }

  /** Imprime un ticket o comprobante. Devuelve false si la impresora no responde. */
  imprimir(_folio: string): boolean {
    try {
      return localStorage.getItem(DEMO_IMPRESORA) !== 'falla';
    } catch {
      return true;
    }
  }
}
