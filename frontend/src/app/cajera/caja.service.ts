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

export interface MovimientoCaja {
  /** RET-0031 / ING-0004 (C11 "Retiro de efectivo"). */
  folio: string;
  fecha: string;
  tipo: 'retiro' | 'ingreso';
  monto: number;
  motivo: string;
  comentario: string;
}

const CLAVE_TURNO = 'shuri.turno';

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

  private readonly pagos = signal<PagoProveedor[]>([]);
  readonly pagosAProveedor = this.pagos.asReadonly();

  /** Sale del efectivo del turno y aparece en el corte como "Pagos a proveedor" (C7.6). */
  pagarProveedor(pago: Omit<PagoProveedor, 'fecha'>): void {
    this.pagos.update((lista) => [...lista, { ...pago, fecha: new Date().toISOString() }]);
  }

  /** Retiros a gerencia e ingresos de efectivo (C10.3). */
  private readonly movimientosCaja = signal<MovimientoCaja[]>([]);
  readonly movimientos = this.movimientosCaja.asReadonly();

  /** Registra el retiro o ingreso y lo devuelve con su folio (los de prueba siguen a RET-0030). */
  registrarMovimiento(movimiento: Omit<MovimientoCaja, 'fecha' | 'folio'>): MovimientoCaja {
    const prefijo = movimiento.tipo === 'retiro' ? 'RET' : 'ING';
    const previos = this.movimientosCaja().filter((m) => m.tipo === movimiento.tipo).length;
    const nuevo: MovimientoCaja = { ...movimiento, folio: `${prefijo}-${String((movimiento.tipo === 'retiro' ? 31 : 5) + previos).padStart(4, '0')}`, fecha: new Date().toISOString() };
    this.movimientosCaja.update((lista) => [...lista, nuevo]);
    return nuevo;
  }

  abrirTurno(datos: Omit<Turno, 'desde'>): void {
    const turno: Turno = { ...datos, desde: new Date().toISOString() };
    this.actual.set(turno);
    guardar(turno);
  }

  /** Corte de caja (C10.4): la caja queda bloqueada hasta una nueva apertura. */
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
