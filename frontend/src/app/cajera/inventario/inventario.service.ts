import { Injectable, computed, signal } from '@angular/core';
import {
  AJUSTES_DEMO,
  Ajuste,
  ENTRADAS_DEMO,
  Entrada,
  FormaPago,
  IVA,
  LineaEntrada,
  PEDIDOS_DEMO,
  PRODUCTOS_DEMO,
  Pedido,
  ProductoInventario,
  TipoAjuste,
  redondear,
} from './inventario.datos';

export type EstadoStock = 'agotado' | 'bajo' | 'justo' | 'suficiente';

/** Piezas que se pueden vender: stock menos lo apartado para reparaciones (regla de Figma C7). */
export function disponible(p: ProductoInventario): number {
  return Math.max(0, p.stock - apartadas(p));
}

export function apartadas(p: ProductoInventario): number {
  return p.apartados.reduce((s, a) => s + a.cantidad, 0);
}

/**
 * Color de la pastilla de stock: sin disponibles (advertencia), en o bajo el mínimo (peligro),
 * hasta el doble del mínimo (neutro) o suficiente (éxito).
 */
export function estadoStock(p: ProductoInventario): EstadoStock {
  if (disponible(p) === 0) return 'agotado';
  if (p.stock <= p.minimo) return 'bajo';
  if (p.stock <= p.minimo * 2) return 'justo';
  return 'suficiente';
}

/** Margen sobre el precio sin IVA: (precio/1.16 − costo) / (precio/1.16). */
export function margen(costo: number, precio: number): { porcentaje: number; importe: number } {
  const neto = precio / (1 + IVA);
  const importe = redondear(neto - costo);
  return { porcentaje: neto > 0 ? Math.round((importe / neto) * 100) : 0, importe };
}

export interface Movimiento {
  fecha: string;
  texto: string;
  /** Piezas que entraron (+) o salieron (−). */
  cantidad: number;
  folio: string;
}

export interface NuevaEntrada {
  proveedor: string;
  documento: string;
  fecha: string;
  pedido: string | null;
  lineas: LineaEntrada[];
  pago: FormaPago;
  recibio: string;
  fotoFactura: boolean;
  nota?: string;
}

/** Inventario de la sucursal (C7). Simulado en memoria mientras no exista la API. */
@Injectable({ providedIn: 'root' })
export class InventarioService {
  readonly productos = signal<ProductoInventario[]>(PRODUCTOS_DEMO);
  readonly entradas = signal<Entrada[]>(ENTRADAS_DEMO);
  readonly ajustes = signal<Ajuste[]>(AJUSTES_DEMO);
  readonly pedidos = signal<Pedido[]>(PEDIDOS_DEMO);
  /** “Guardar borrador” de la entrada de mercancía (C7.3). */
  readonly borrador = signal<NuevaEntrada | null>(null);

  readonly stockBajo = computed(() => this.productos().filter((p) => estadoStock(p) === 'bajo').length);
  readonly sinExistencias = computed(() => this.productos().filter((p) => estadoStock(p) === 'agotado').length);

  buscar(sku: string): ProductoInventario | undefined {
    return this.productos().find((p) => p.sku === sku);
  }

  /** Busca por SKU o código de barras exacto (lo que escribe el lector). */
  porCodigo(texto: string): ProductoInventario | undefined {
    const t = texto.trim().toUpperCase();
    return this.productos().find((p) => p.sku.toUpperCase() === t || p.codigoBarras === t);
  }

  /** J3.2 · Aparta piezas para una orden (reemplaza lo que ya tuviera apartado esa orden). */
  apartar(sku: string, cantidad: number, folio: string): void {
    this.productos.update((lista) =>
      lista.map((p) => (p.sku === sku ? { ...p, apartados: [...p.apartados.filter((a) => a.folio !== folio), { cantidad, folio }] } : p)),
    );
  }

  /** Piezas que puede usar una orden: stock menos lo apartado para otras órdenes. */
  paraOrden(sku: string, folio: string): number {
    const p = this.buscar(sku);
    return p ? Math.max(0, p.stock - p.apartados.filter((a) => a.folio !== folio).reduce((s, a) => s + a.cantidad, 0)) : 0;
  }

  /** Fecha de llegada del pedido al proveedor que trae esa pieza (C7.5), si hay uno. */
  llegada(sku: string): string | null {
    return this.pedidos().find((p) => p.lineas.some((l) => l.sku === sku))?.llega ?? null;
  }

  // ---------- Alta y edición (C7.1) ----------
  guardar(producto: ProductoInventario, skuOriginal: string | null): void {
    this.productos.update((lista) =>
      skuOriginal ? lista.map((p) => (p.sku === skuOriginal ? { ...producto, apartados: p.apartados } : p)) : [producto, ...lista],
    );
  }

  // ---------- Importar desde Excel (C7.2) ----------
  importar(filas: ProductoInventario[], sumarStock: boolean): void {
    this.productos.update((lista) => {
      const nueva = [...lista];
      for (const fila of filas) {
        const i = nueva.findIndex((p) => p.sku === fila.sku);
        if (i < 0) nueva.unshift(fila);
        else {
          const actual = nueva[i];
          nueva[i] = { ...actual, nombre: fila.nombre, categoria: fila.categoria, costo: fila.costo, precio: fila.precio, stock: sumarStock ? actual.stock + fila.stock : fila.stock };
        }
      }
      return nueva;
    });
  }

  // ---------- Entradas de mercancía (C7.3 / C7.5) ----------
  siguienteEntrada(): string {
    const max = Math.max(0, ...this.entradas().map((e) => Number(e.folio.slice(4))));
    return `ENT-${String(max + 1).padStart(4, '0')}`;
  }

  registrarEntrada(datos: NuevaEntrada): Entrada {
    const subtotal = redondear(datos.lineas.reduce((s, l) => s + l.cantidad * l.costo, 0));
    const iva = redondear(subtotal * IVA);
    const entrada: Entrada = { ...datos, folio: this.siguienteEntrada(), subtotal, iva, total: redondear(subtotal + iva) };
    // Stock nuevo y costo promedio ponderado; lo que viene para una orden queda apartado.
    this.productos.update((lista) =>
      lista.map((p) => {
        const lineas = datos.lineas.filter((l) => l.sku === p.sku);
        if (!lineas.length) return p;
        let { stock, costo } = p;
        const apartados = [...p.apartados];
        for (const l of lineas) {
          costo = stock + l.cantidad > 0 ? redondear((stock * costo + l.cantidad * l.costo) / (stock + l.cantidad)) : l.costo;
          stock += l.cantidad;
          if (l.orden) apartados.push({ cantidad: l.cantidad, folio: l.orden });
        }
        return { ...p, stock, costo, apartados };
      }),
    );
    this.entradas.update((lista) => [entrada, ...lista]);
    if (datos.pedido) this.pedidos.update((lista) => lista.filter((p) => p.folio !== datos.pedido));
    this.borrador.set(null);
    return entrada;
  }

  // ---------- Ajustes (C7.4) ----------
  aplicarAjuste(sku: string, tipo: TipoAjuste, diferencia: number, motivo: string, hizo: string): Ajuste {
    const producto = this.buscar(sku)!;
    const folio = `AJ-${String(Math.max(0, ...this.ajustes().map((a) => Number(a.folio.slice(3)))) + 1).padStart(4, '0')}`;
    const ajuste: Ajuste = {
      folio,
      fecha: new Date().toISOString(),
      sku,
      nombre: producto.nombre,
      tipo,
      diferencia,
      stockAntes: producto.stock,
      valor: redondear(diferencia * producto.costo),
      motivo,
      hizo,
    };
    this.productos.update((lista) => lista.map((p) => (p.sku === sku ? { ...p, stock: p.stock + diferencia } : p)));
    this.ajustes.update((lista) => [ajuste, ...lista]);
    return ajuste;
  }

  /** Historial de un producto: entradas y ajustes (las ventas llegan con la API). */
  movimientos(sku: string): Movimiento[] {
    const entradas = this.entradas().flatMap((e) =>
      e.lineas.filter((l) => l.sku === sku).map((l) => ({ fecha: e.fecha, texto: `Entrada · ${e.proveedor}${l.orden ? ` · aparta ${l.orden}` : ''}`, cantidad: l.cantidad, folio: e.folio })),
    );
    const ajustes = this.ajustes()
      .filter((a) => a.sku === sku)
      .map((a) => ({ fecha: a.fecha, texto: `Ajuste · ${a.motivo}`, cantidad: a.diferencia, folio: a.folio }));
    return [...entradas, ...ajustes].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }
}
