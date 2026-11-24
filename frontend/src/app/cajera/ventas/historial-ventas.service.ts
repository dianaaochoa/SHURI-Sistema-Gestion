import { Injectable, computed, inject, signal } from '@angular/core';
import { InventarioService } from '../inventario/inventario.service';
import { DispositivosService } from '../punto-de-venta/dispositivos.service';
import { CATALOGO } from '../punto-de-venta/catalogo.datos';
import { CLIENTES, Cliente, PUBLICO_GENERAL } from '../punto-de-venta/clientes.datos';
import {
  DescuentoVenta,
  IVA,
  Linea,
  MetodoPago,
  NotaAplicada,
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
  /** Nota de crédito que pagó parte del total (lo demás, con `metodo`). */
  nota?: NotaAplicada;
  /** Comisión de la terminal cobrada al cliente además del total. */
  comision?: number;
  /** Cobro de la entrega de una orden de servicio (C3 la muestra; se ajusta desde la orden, no aquí). */
  orden?: string;
  estado: EstadoVenta;
  devoluciones: Devolucion[];
}

/** Días que vale una nota de crédito (lo dice el comprobante de la devolución). */
export const VIGENCIA_NOTA = 90;

/** Nota de crédito (o saldo de un “cambio por otro”) que nace de una devolución. */
export interface NotaCredito {
  folio: string;
  cliente: Cliente;
  /** Venta de la que salió. */
  venta: string;
  forma: 'nota' | 'cambio';
  /** ISO */
  fecha: string;
  /** ISO */
  vence: string;
  monto: number;
  /** Lo que falta por usar. */
  saldo: number;
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
  private readonly inventario = inject(InventarioService);

  constructor() {
    // Ventas cobradas sin conexión que siguen guardadas en el equipo (la página se recargó antes de reconectar).
    const dispositivos = inject(DispositivosService);
    for (const p of dispositivos.sinConexion()) {
      if (!this.ventas().some((v) => v.folio === p.venta.folio)) this.registrar(p.venta, p.cajera, p.fecha);
    }
    // Si ya hay internet, se suben de una vez (el aviso de Punto de venta dice cuántas).
    if (dispositivos.porSincronizar() && navigator.onLine) queueMicrotask(() => dispositivos.reintentarConexion());
  }

  /**
   * Notas de crédito: cada devolución “en nota de crédito” o “para cambio por otro” deja un saldo al cliente
   * (folio NC-0007…) que se usa al cobrar en Punto de venta. El saldo baja con cada venta que la aplica.
   */
  readonly notas = computed<NotaCredito[]>(() => {
    const ventas = this.ventas();
    const usado = new Map<string, number>();
    for (const v of ventas) if (v.nota && v.estado !== 'cancelada') usado.set(v.nota.folio, (usado.get(v.nota.folio) ?? 0) + v.nota.monto);
    const origen = ventas
      .flatMap((v) => v.devoluciones.map((d) => ({ v, d })))
      .filter(({ d }) => d.forma === 'nota' || d.forma === 'cambio')
      .sort((a, b) => a.d.fecha.localeCompare(b.d.fecha));
    return origen.map(({ v, d }, i) => {
      const folio = `NC-${String(6 + i + 1).padStart(4, '0')}`;
      const vence = new Date(d.fecha);
      vence.setDate(vence.getDate() + VIGENCIA_NOTA);
      return {
        folio,
        cliente: v.cliente,
        venta: v.folio,
        forma: d.forma as 'nota' | 'cambio',
        fecha: d.fecha,
        vence: vence.toISOString(),
        monto: d.monto,
        saldo: redondear(Math.max(0, d.monto - (usado.get(folio) ?? 0))),
      };
    });
  });

  /** Folio de la nota que nació de una devolución (para el comprobante). */
  folioNota(venta: VentaRegistrada, indice: number): string {
    const d = venta.devoluciones[indice];
    return this.notas().find((n) => n.venta === venta.folio && n.fecha === d.fecha)?.folio ?? 'NC-—';
  }

  /** Notas con saldo y vigentes; de un cliente o, con `folio`, la que se escaneó o escribió. */
  notasUsables(clienteId: string | null, folio?: string): NotaCredito[] {
    const hoy = new Date().toISOString();
    return this.notas().filter((n) => n.saldo > 0 && n.vence >= hoy && (folio ? n.folio === folio.trim().toUpperCase() : n.cliente.id === clienteId));
  }

  registrar(cobrada: VentaCobrada, cajera: string, fecha = new Date().toISOString()): void {
    const nueva: VentaRegistrada = {
      folio: cobrada.folio,
      fecha,
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
      nota: cobrada.nota,
      comision: cobrada.comision,
      estado: 'pagada',
      devoluciones: [],
    };
    this.ventas.update((lista) => [nueva, ...lista.filter((v) => v.folio !== nueva.folio)]);
    // Lo vendido sale del inventario (los productos temporales no están en él).
    for (const l of cobrada.lineas) this.inventario.moverStock(l.sku, -l.cantidad);
  }

  cancelar(folio: string): void {
    const venta = this.ventas().find((v) => v.folio === folio);
    // Regresa al inventario lo que no se había devuelto antes.
    if (venta && venta.estado !== 'cancelada') for (const l of venta.lineas) this.inventario.moverStock(l.sku, l.cantidad - devueltas(venta, l.sku));
    this.actualizar(folio, (v) => ({ ...v, estado: 'cancelada' }));
  }

  devolver(folio: string, devolucion: Devolucion): void {
    // Solo lo que vuelve en buen estado regresa a venta; lo defectuoso va al proveedor y lo abierto se revisa antes.
    if (devolucion.estadoProducto.startsWith('Buen estado')) for (const a of devolucion.articulos) this.inventario.moverStock(a.sku, a.cantidad);
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
