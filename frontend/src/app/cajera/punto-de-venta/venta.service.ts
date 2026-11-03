import { Injectable, computed, signal } from '@angular/core';
import { Producto } from './catalogo.datos';

export const IVA = 0.16;

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

const redondear = (valor: number) => Math.round(valor * 100) / 100;

export function totalLinea(linea: Linea): number {
  return redondear(linea.precio * linea.cantidad * (1 - linea.descuento / 100));
}

/**
 * Venta en curso del punto de venta (C2). Vive en memoria mientras la cajera navega por el sistema.
 * Simulada: al conectar la API, `cobrar` enviará la venta y el folio vendrá del servidor.
 */
@Injectable({ providedIn: 'root' })
export class VentaService {
  private readonly lineasActuales = signal<Linea[]>([]);
  private readonly numeroFolio = signal(865);
  private siguienteTemporal = 13;

  readonly lineas = this.lineasActuales.asReadonly();
  readonly folio = computed(() => `V-${String(this.numeroFolio()).padStart(5, '0')}`);
  readonly cliente = signal('Cliente general');

  readonly vacia = computed(() => this.lineasActuales().length === 0);
  readonly articulos = computed(() => this.lineasActuales().reduce((suma, l) => suma + l.cantidad, 0));
  readonly subtotal = computed(() => redondear(this.lineasActuales().reduce((suma, l) => suma + totalLinea(l), 0)));
  readonly descuento = computed(() =>
    redondear(this.lineasActuales().reduce((suma, l) => suma + l.precio * l.cantidad - totalLinea(l), 0)),
  );
  readonly iva = computed(() => redondear(this.subtotal() * IVA));
  readonly total = computed(() => redondear(this.subtotal() + this.iva()));

  /** Agrega un producto o suma uno si ya está. Devuelve false si ya no hay disponibles. */
  agregar(producto: Producto): boolean {
    const existente = this.lineasActuales().find((l) => l.sku === producto.sku);
    if (existente) return this.cambiarCantidad(producto.sku, 1);
    if (producto.disponibles < 1) return false;
    this.lineasActuales.update((lineas) => [
      ...lineas,
      { sku: producto.sku, nombre: producto.nombre, precio: producto.precio, cantidad: 1, descuento: 0, disponibles: producto.disponibles },
    ]);
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

  fijarDescuento(sku: string, porcentaje: number): void {
    const descuento = Math.min(100, Math.max(0, Math.round(porcentaje) || 0));
    this.lineasActuales.update((lineas) => lineas.map((l) => (l.sku === sku ? { ...l, descuento } : l)));
  }

  quitar(sku: string): void {
    this.lineasActuales.update((lineas) => lineas.filter((l) => l.sku !== sku));
  }

  cancelar(): void {
    this.lineasActuales.set([]);
    this.cliente.set('Cliente general');
  }

  cobrar(pago: Pago): VentaCobrada {
    const cobrada: VentaCobrada = {
      folio: this.folio(),
      total: this.total(),
      metodo: pago.metodo,
      cambio: pago.metodo === 'efectivo' ? redondear(pago.recibido - this.total()) : 0,
    };
    this.cancelar();
    this.numeroFolio.update((n) => n + 1);
    return cobrada;
  }
}
