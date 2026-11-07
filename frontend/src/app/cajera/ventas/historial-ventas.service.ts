import { Injectable, signal } from '@angular/core';
import { CATALOGO } from '../punto-de-venta/catalogo.datos';
import { CLIENTES, Cliente, PUBLICO_GENERAL } from '../punto-de-venta/clientes.datos';
import {
  DescuentoVenta,
  IVA,
  Linea,
  MetodoPago,
  ParteMixta,
  VentaCobrada,
  calcularTotales,
  redondear,
} from '../punto-de-venta/venta.service';

export type EstadoVenta = 'pagada' | 'devolucion-parcial' | 'devuelta' | 'cancelada';
export type FormaReembolso = 'efectivo' | 'tarjeta' | 'nota' | 'cambio';

export interface Devolucion {
  /** ISO */
  fecha: string;
  articulos: { sku: string; cantidad: number }[];
  monto: number;
  forma: FormaReembolso;
  motivo: string;
  estadoProducto: string;
}

export interface VentaRegistrada {
  folio: string;
  /** ISO */
  fecha: string;
  cliente: Cliente;
  cajera: string;
  lineas: Linea[];
  descuento: DescuentoVenta | null;
  subtotal: number;
  iva: number;
  total: number;
  metodo: MetodoPago;
  recibido: number;
  cambio: number;
  referencia?: string;
  partes?: ParteMixta[];
  estado: EstadoVenta;
  devoluciones: Devolucion[];
}

/** Días para aceptar una devolución (aviso de Figma C3.1). */
export const DIAS_DEVOLUCION = 7;

export const ESTADOS: Record<EstadoVenta, { texto: string; tono: string }> = {
  pagada: { texto: 'Pagada', tono: 'exito' },
  'devolucion-parcial': { texto: 'Devolución parcial', tono: 'advertencia' },
  devuelta: { texto: 'Devuelta', tono: 'advertencia' },
  cancelada: { texto: 'Cancelada', tono: 'neutro' },
};

export const METODOS: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  mixto: 'Mixto',
};

export const articulosDe = (venta: VentaRegistrada) => venta.lineas.reduce((suma, l) => suma + l.cantidad, 0);

/** Piezas de un artículo que ya se devolvieron. */
export function devueltas(venta: VentaRegistrada, sku: string): number {
  return venta.devoluciones.reduce((suma, d) => suma + (d.articulos.find((a) => a.sku === sku)?.cantidad ?? 0), 0);
}

/**
 * Lo que se le regresa al cliente por `cantidad` piezas de una línea: su precio con descuento de línea,
 * la parte proporcional del descuento a toda la venta y el IVA (lo que realmente pagó).
 */
export function importeDevolucion(venta: VentaRegistrada, sku: string, cantidad: number): number {
  const linea = venta.lineas.find((l) => l.sku === sku);
  if (!linea || cantidad <= 0) return 0;
  const { subtotalLineas, subtotal } = calcularTotales(venta.lineas, venta.descuento);
  const proporcion = subtotalLineas ? subtotal / subtotalLineas : 1;
  return redondear(linea.precio * cantidad * (1 - linea.descuento / 100) * proporcion * (1 + IVA));
}

export const reembolsado = (venta: VentaRegistrada) => redondear(venta.devoluciones.reduce((suma, d) => suma + d.monto, 0));

// ---------- Datos de prueba (Figma C3.1) ----------

function lineaDe(sku: string, cantidad = 1, descuento = 0): Linea {
  const p = CATALOGO.find((producto) => producto.sku === sku)!;
  return { sku, nombre: p.nombre, precio: p.precio, cantidad, descuento, disponibles: p.disponibles };
}

const cliente = (nombre: string): Cliente => CLIENTES.find((c) => c.nombre === nombre) ?? { id: nombre, nombre };

/** Hace `dias` días a la hora dada; si hoy todavía no llega esa hora, unos minutos antes de ahora. */
function hace(dias: number, hora: string, respaldoMinutos: number): string {
  const ahora = new Date();
  const fecha = new Date(ahora);
  fecha.setDate(fecha.getDate() - dias);
  const [h, m] = hora.split(':').map(Number);
  fecha.setHours(h, m, 0, 0);
  return (fecha > ahora ? new Date(ahora.getTime() - respaldoMinutos * 60_000) : fecha).toISOString();
}

interface Demo {
  folio: string;
  fecha: string;
  cliente: Cliente;
  lineas: Linea[];
  metodo: MetodoPago;
  recibido?: number;
  referencia?: string;
  partes?: ParteMixta[];
  estado?: EstadoVenta;
  cajera?: string;
}

function venta(d: Demo): VentaRegistrada {
  const t = calcularTotales(d.lineas, null);
  const recibido = d.recibido ?? t.total;
  return {
    folio: d.folio,
    fecha: d.fecha,
    cliente: d.cliente,
    cajera: d.cajera ?? 'Ana Martínez',
    lineas: d.lineas,
    descuento: null,
    subtotal: t.subtotal,
    iva: t.iva,
    total: t.total,
    metodo: d.metodo,
    recibido,
    cambio: Math.max(0, redondear(recibido - t.total)),
    referencia: d.referencia,
    partes: d.partes,
    estado: d.estado ?? 'pagada',
    devoluciones: [],
  };
}

/** Folios, clientes, métodos y estados de Figma C3.1. Los totales salen de los productos del catálogo de prueba. */
function ventasDemo(): VentaRegistrada[] {
  const v862 = venta({
    folio: 'V-00862',
    fecha: hace(0, '13:42', 50),
    cliente: cliente('María Hernández'),
    lineas: [lineaDe('ACC-001', 2), lineaDe('ACC-020', 1, 10), lineaDe('ACC-014'), lineaDe('ACC-052')],
    metodo: 'efectivo',
    recibido: 1000,
  });
  const v860 = venta({
    folio: 'V-00860',
    fecha: hace(1, '18:10', 0),
    cliente: { id: 'jorge-salinas', nombre: 'Jorge Salinas' },
    lineas: [lineaDe('ACC-001', 2), lineaDe('ACC-014')],
    metodo: 'tarjeta',
    referencia: '771204',
    estado: 'devolucion-parcial',
  });
  v860.devoluciones.push({
    fecha: hace(0, '10:05', 120),
    articulos: [{ sku: 'ACC-014', cantidad: 1 }],
    monto: importeDevolucion(v860, 'ACC-014', 1),
    forma: 'tarjeta',
    motivo: 'Producto defectuoso',
    estadoProducto: 'Defectuoso · a proveedor',
  });
  return [
    v862,
    venta({
      folio: 'V-00861',
      fecha: hace(0, '11:48', 140),
      cliente: PUBLICO_GENERAL,
      lineas: [lineaDe('ACC-020')],
      metodo: 'transferencia',
      referencia: 'BBVA2026110311',
    }),
    v860,
    venta({ folio: 'V-00859', fecha: hace(1, '16:52', 0), cliente: PUBLICO_GENERAL, lineas: [lineaDe('ACC-052'), lineaDe('ACC-046')], metodo: 'efectivo', recibido: 400 }),
    venta({
      folio: 'V-00858',
      fecha: hace(2, '12:31', 0),
      cliente: { id: 'laura-gomez', nombre: 'Laura Gómez' },
      lineas: [lineaDe('ACC-025'), lineaDe('ACC-021'), lineaDe('ACC-001', 2)],
      metodo: 'mixto',
      partes: [
        { metodo: 'efectivo', monto: 500, referencia: '' },
        { metodo: 'tarjeta', monto: 903.6, referencia: '640112' },
      ],
    }),
    venta({ folio: 'V-00857', fecha: hace(3, '09:18', 0), cliente: PUBLICO_GENERAL, lineas: [lineaDe('ACC-001')], metodo: 'efectivo', estado: 'cancelada' }),
    venta({
      folio: 'V-00856',
      fecha: hace(4, '17:05', 0),
      cliente: { id: 'sofia-lopez', nombre: 'Sofía López' },
      lineas: [lineaDe('ACC-014'), lineaDe('ACC-052')],
      metodo: 'tarjeta',
      referencia: '552310',
      cajera: 'Luis Pérez',
    }),
  ];
}

/**
 * Historial de ventas (C3). Simulado: guarda en memoria las ventas de prueba y las que se cobran en el punto de venta.
 * Al conectar la API, las ventas, cancelaciones y devoluciones vendrán del servidor.
 */
@Injectable({ providedIn: 'root' })
export class HistorialVentasService {
  readonly ventas = signal<VentaRegistrada[]>(ventasDemo());
  /** Cajeras para el filtro (Figma: "Todas las cajeras"). */
  readonly cajeras = ['Ana Martínez', 'Luis Pérez'];

  registrar(cobrada: VentaCobrada, cajera: string): void {
    const nueva: VentaRegistrada = {
      folio: cobrada.folio,
      fecha: new Date().toISOString(),
      cliente: cobrada.cliente,
      cajera,
      lineas: cobrada.lineas,
      descuento: cobrada.descuento,
      subtotal: cobrada.subtotal,
      iva: cobrada.iva,
      total: cobrada.total,
      metodo: cobrada.metodo,
      recibido: cobrada.recibido,
      cambio: cobrada.cambio,
      referencia: cobrada.referencia,
      partes: cobrada.partes,
      estado: 'pagada',
      devoluciones: [],
    };
    this.ventas.update((lista) => [nueva, ...lista.filter((v) => v.folio !== nueva.folio)]);
  }

  cancelar(folio: string): void {
    this.actualizar(folio, (v) => ({ ...v, estado: 'cancelada' }));
  }

  devolver(folio: string, devolucion: Devolucion): void {
    this.actualizar(folio, (v) => {
      const devoluciones = [...v.devoluciones, devolucion];
      const conDevolucion = { ...v, devoluciones };
      const todo = v.lineas.every((l) => devueltas(conDevolucion, l.sku) >= l.cantidad);
      return { ...conDevolucion, estado: todo ? 'devuelta' : 'devolucion-parcial' };
    });
  }

  private actualizar(folio: string, cambio: (venta: VentaRegistrada) => VentaRegistrada): void {
    this.ventas.update((lista) => lista.map((v) => (v.folio === folio ? cambio(v) : v)));
  }
}
