import { Injectable, computed, signal } from '@angular/core';
import { CATALOGO, Producto } from './catalogo.datos';
import { CLIENTES, Cliente, PUBLICO_GENERAL } from './clientes.datos';

export const IVA = 0.16;
/** Descuento máximo para la cajera (Figma C2.6: "lo define el administrador"). Vendrá de la configuración (AD9). */
export const DESCUENTO_MAXIMO = 10;

export interface Linea {
  sku: string;
  nombre: string;
  /** Precio unitario antes de IVA. */
  precio: number;
  cantidad: number;
  /** Descuento de la línea en %. */
  descuento: number;
  /** null en productos temporales (no salen del inventario). */
  disponibles: number | null;
  nota?: string;
}

/** Descuento a toda la venta (C2.6): en % o en $ sobre el total con IVA. */
export interface DescuentoVenta {
  modo: '%' | '$';
  valor: number;
  motivo: string;
}

export interface VentaPausada {
  folio: string;
  cliente: Cliente;
  lineas: Linea[];
  descuento: DescuentoVenta | null;
  nota: string;
  /** ISO */
  pausadaEn: string;
}

export interface ProductoTemporal {
  nombre: string;
  cantidad: number;
  /** El modal C2.7 captura el precio con IVA incluido. */
  precioConIva: number;
  costo: number | null;
  categoria: string;
  nota: string;
  darDeAlta: boolean;
}

export type MetodoPago = 'efectivo' | 'tarjeta' | 'transferencia';

export interface Pago {
  metodo: MetodoPago;
  recibido: number;
  referencia?: string;
  imprimir: boolean;
  enviarCorreo: boolean;
}

export interface VentaCobrada {
  folio: string;
  total: number;
  metodo: MetodoPago;
  cambio: number;
}

export const redondear = (valor: number) => Math.round(valor * 100) / 100;

export function totalLinea(linea: Linea): number {
  return redondear(linea.precio * linea.cantidad * (1 - linea.descuento / 100));
}

/** Totales de un conjunto de líneas con un descuento a toda la venta. Precios antes de IVA. */
export function calcularTotales(lineas: Linea[], descuento: DescuentoVenta | null) {
  const subtotalLineas = redondear(lineas.reduce((suma, l) => suma + totalLinea(l), 0));
  const descuentoLineas = redondear(lineas.reduce((suma, l) => suma + l.precio * l.cantidad, 0) - subtotalLineas);
  const descuentoVenta = !descuento
    ? 0
    : descuento.modo === '%'
      ? redondear((subtotalLineas * descuento.valor) / 100)
      : redondear(descuento.valor / (1 + IVA));
  const subtotal = redondear(subtotalLineas - descuentoVenta);
  const iva = redondear(subtotal * IVA);
  return { subtotalLineas, subtotal, iva, total: redondear(subtotal + iva), descuento: redondear(descuentoLineas + descuentoVenta) };
}

const folio = (numero: number) => `V-${String(numero).padStart(5, '0')}`;

const lineaDe = (sku: string, cantidad = 1): Linea => {
  const p = CATALOGO.find((producto) => producto.sku === sku)!;
  return { sku: p.sku, nombre: p.nombre, precio: p.precio, cantidad, descuento: 0, disponibles: p.disponibles };
};

/** Ventas pausadas de prueba (Figma C2.9). Sus totales salen de los productos, no de los importes fijos de Figma. */
function pausadasDemo(): VentaPausada[] {
  const haceMinutos = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString();
  return [
    {
      folio: folio(864),
      cliente: PUBLICO_GENERAL,
      lineas: [lineaDe('ACC-052'), lineaDe('ACC-001'), lineaDe('ACC-014')],
      descuento: null,
      nota: 'Fue por su cartera',
      pausadaEn: haceMinutos(4),
    },
    {
      folio: folio(863),
      cliente: CLIENTES.find((c) => c.nombre === 'Raúl Ortiz')!,
      lineas: [lineaDe('ACC-020'), lineaDe('ACC-014')],
      descuento: null,
      nota: 'Regresa por la tarde',
      pausadaEn: haceMinutos(25),
    },
  ];
}

/**
 * Venta en curso del punto de venta (C2) y ventas pausadas del turno.
 * Vive en memoria mientras la cajera navega por el sistema.
 * Simulada: al conectar la API, `cobrar` enviará la venta y el folio vendrá del servidor.
 */
@Injectable({ providedIn: 'root' })
export class VentaService {
  private readonly lineasActuales = signal<Linea[]>([]);
  private readonly numeroFolio = signal(865);
  private siguienteFolio = 866;
  private siguienteTemporal = 13;

  readonly lineas = this.lineasActuales.asReadonly();
  readonly folio = computed(() => folio(this.numeroFolio()));
  readonly cliente = signal<Cliente>(PUBLICO_GENERAL);
  readonly descuentoVenta = signal<DescuentoVenta | null>(null);
  readonly pausadas = signal<VentaPausada[]>(pausadasDemo());

  readonly vacia = computed(() => this.lineasActuales().length === 0);
  readonly articulos = computed(() => this.lineasActuales().reduce((suma, l) => suma + l.cantidad, 0));
  private readonly totales = computed(() => calcularTotales(this.lineasActuales(), this.descuentoVenta()));
  readonly subtotal = computed(() => this.totales().subtotal);
  readonly descuento = computed(() => this.totales().descuento);
  readonly iva = computed(() => this.totales().iva);
  readonly total = computed(() => this.totales().total);
  /** Total con IVA sin el descuento a toda la venta (C2.6 "Total actual"). */
  readonly totalSinDescuentoVenta = computed(() => calcularTotales(this.lineasActuales(), null).total);
  /** Nombre que muestra el botón de cliente (Figma: "Cliente general"). */
  readonly etiquetaCliente = computed(() => (this.cliente().id === PUBLICO_GENERAL.id ? 'Cliente general' : this.cliente().nombre));

  /** Agrega un producto o suma uno si ya está. Devuelve false si ya no hay disponibles. */
  agregar(producto: Producto): boolean {
    const existente = this.lineasActuales().find((l) => l.sku === producto.sku);
    if (existente) return this.cambiarCantidad(producto.sku, 1);
    if (producto.disponibles < 1) return false;
    this.lineasActuales.update((lineas) => [...lineas, lineaDe(producto.sku)]);
    return true;
  }

  agregarTemporal(temporal: ProductoTemporal): void {
    const sku = `TMP-${String(this.siguienteTemporal++).padStart(4, '0')}`;
    this.lineasActuales.update((lineas) => [
      ...lineas,
      {
        sku,
        nombre: temporal.nombre,
        precio: redondear(temporal.precioConIva / (1 + IVA)),
        cantidad: temporal.cantidad,
        descuento: 0,
        disponibles: null,
        nota: temporal.nota || undefined,
      },
    ]);
  }

  /** Código que tendrá el siguiente producto temporal (se muestra en C2.7). */
  codigoTemporal(): string {
    return `TMP-${String(this.siguienteTemporal).padStart(4, '0')}`;
  }

  cambiarCantidad(sku: string, cambio: number): boolean {
    let aplicado = false;
    this.lineasActuales.update((lineas) =>
      lineas.map((l) => {
        if (l.sku !== sku) return l;
        const cantidad = l.cantidad + cambio;
        if (cantidad < 1 || (l.disponibles !== null && cantidad > l.disponibles)) return l;
        aplicado = true;
        return { ...l, cantidad };
      }),
    );
    return aplicado;
  }

  /** Descuento de una línea en %, de 0 al máximo permitido. */
  fijarDescuento(sku: string, porcentaje: number): void {
    const descuento = Math.min(DESCUENTO_MAXIMO, Math.max(0, Math.round(porcentaje * 100) / 100 || 0));
    this.lineasActuales.update((lineas) => lineas.map((l) => (l.sku === sku ? { ...l, descuento } : l)));
  }

  quitar(sku: string): void {
    this.lineasActuales.update((lineas) => lineas.filter((l) => l.sku !== sku));
  }

  cancelar(): void {
    this.lineasActuales.set([]);
    this.cliente.set(PUBLICO_GENERAL);
    this.descuentoVenta.set(null);
  }

  /** C2.8: guarda la venta en "En espera" y deja la caja lista para otro cliente con un folio nuevo. */
  pausar(nota: string): void {
    if (this.vacia()) return;
    this.pausadas.update((lista) => [
      {
        folio: this.folio(),
        cliente: this.cliente(),
        lineas: this.lineasActuales(),
        descuento: this.descuentoVenta(),
        nota: nota.trim(),
        pausadaEn: new Date().toISOString(),
      },
      ...lista,
    ]);
    this.cancelar();
    this.numeroFolio.set(this.siguienteFolio++);
  }

  /** C2.9: retoma una venta pausada; si hay una venta en curso, se pausa primero. */
  retomar(folioPausada: string): void {
    const venta = this.pausadas().find((p) => p.folio === folioPausada);
    if (!venta) return;
    if (!this.vacia()) this.pausar('');
    this.pausadas.update((lista) => lista.filter((p) => p.folio !== folioPausada));
    this.lineasActuales.set(venta.lineas);
    this.cliente.set(venta.cliente);
    this.descuentoVenta.set(venta.descuento);
    this.numeroFolio.set(Number(venta.folio.slice(2)));
  }

  descartar(folioPausada: string): void {
    this.pausadas.update((lista) => lista.filter((p) => p.folio !== folioPausada));
  }

  cobrar(pago: Pago): VentaCobrada {
    const cobrada: VentaCobrada = {
      folio: this.folio(),
      total: this.total(),
      metodo: pago.metodo,
      cambio: pago.metodo === 'efectivo' ? redondear(pago.recibido - this.total()) : 0,
    };
    this.cancelar();
    this.numeroFolio.set(this.siguienteFolio++);
    return cobrada;
  }
}
