import { Injectable, computed, signal } from '@angular/core';

export type NombreTurno = 'Matutino' | 'Vespertino';

export interface Turno {
  caja: string;
  turno: NombreTurno;
  /** Hora de apertura (ISO). */
  desde: string;
  /** Fondo inicial contado al abrir. */
  fondo: number;
}

export interface PagoProveedor {
  fecha: string;
  proveedor: string;
  documento: string;
  pedido: string | null;
  monto: number;
}

const CLAVE_TURNO = 'shuri.turno';
const EFECTIVO_DEMO = 7180;

/**
 * Estado de la caja de la cajera (C1). Simulado mientras no exista la API.
 * El turno se guarda en el navegador: si la cajera sale sin cerrarlo, la caja
 * sigue abierta a su nombre (C1.7).
 */
@Injectable({ providedIn: 'root' })
export class CajaService {
  readonly cajas = ['Caja 01'];
  /** Fondo que el administrador asignó a la caja. */
  readonly fondoAsignado = 1000;

  private readonly actual = signal<Turno | null>(leerTurno());

  readonly turno = this.actual.asReadonly();
  readonly abierta = computed(() => this.actual() !== null);
  /** Línea de estado del menú lateral (Figma C1.1 / C1.2). */
  readonly resumen = computed(() => {
    const turno = this.actual();
    return turno ? `${turno.caja} · Turno abierto` : `${this.cajas[0]} · Caja cerrada`;
  });

  /**
   * Efectivo en el cajón para pagar a proveedores (C7.6). Arranca con el dato de Figma;
   * el corte de caja (C10) lo calculará con fondo + ventas en efectivo − retiros − pagos.
   */
  private readonly pagos = signal<PagoProveedor[]>([]);
  readonly pagosAProveedor = this.pagos.asReadonly();
  readonly efectivoEnCaja = computed(() => EFECTIVO_DEMO - this.pagos().reduce((s, p) => s + p.monto, 0));

  /** Sale del efectivo del turno y aparece en el corte como "Pagos a proveedor". */
  pagarProveedor(pago: Omit<PagoProveedor, 'fecha'>): void {
    this.pagos.update((lista) => [...lista, { ...pago, fecha: new Date().toISOString() }]);
  }

  abrirTurno(datos: Omit<Turno, 'desde'>): void {
    const turno: Turno = { ...datos, desde: new Date().toISOString() };
    this.actual.set(turno);
    guardar(turno);
  }

  /** Lo usará el corte de caja (C10). */
  cerrarTurno(): void {
    this.actual.set(null);
    guardar(null);
  }
}

function leerTurno(): Turno | null {
  try {
    const guardado = localStorage.getItem(CLAVE_TURNO);
    return guardado ? (JSON.parse(guardado) as Turno) : null;
  } catch {
    return null;
  }
}

function guardar(turno: Turno | null): void {
  try {
    if (turno) localStorage.setItem(CLAVE_TURNO, JSON.stringify(turno));
    else localStorage.removeItem(CLAVE_TURNO);
  } catch {
    // Sin almacenamiento el turno solo dura mientras la pestaña esté abierta.
  }
}
