import { Injectable, inject, signal } from '@angular/core';
import { MovimientoCaja } from '../caja.service';
import type { Corte } from '../corte/corte.service';
import { Orden, OrdenesService } from '../ordenes/ordenes.service';
import { DispositivosService } from '../punto-de-venta/dispositivos.service';
import { HistorialVentasService, VentaRegistrada } from '../ventas/historial-ventas.service';

/** Encabezado de todos los documentos (Figma C11). */
export const NEGOCIO = {
  nombre: 'SHURI',
  lema: 'REPARACIONES Y VENTAS',
  direccion: 'SHURI · Av. Juárez 1234, Torreón, Coah.',
  direccionLarga: 'SHURI · Av. Juárez 1234, Col. Centro, Torreón, Coah.',
  rfc: 'SRV250101AB1',
  web: 'shuri.mx',
  encargado: 'Jorge López',
};

/** C11 · Documentos impresos. */
export type Documento =
  | { tipo: 'venta'; venta: VentaRegistrada }
  | { tipo: 'orden'; orden: Orden; formato: 'ticket' | 'carta' }
  | { tipo: 'entrega'; orden: Orden }
  | { tipo: 'devolucion'; venta: VentaRegistrada; indice: number }
  | { tipo: 'garantia'; orden: Orden }
  | { tipo: 'corte'; corte: Corte }
  | { tipo: 'movimiento'; movimiento: MovimientoCaja; antes: number; despues: number; cajera: string; caja: string };

export function folioDe(doc: Documento): string {
  switch (doc.tipo) {
    case 'venta':
    case 'devolucion':
      return doc.venta.folio;
    case 'corte':
      return doc.corte.folio;
    case 'movimiento':
      return doc.movimiento.folio;
    default:
      return doc.orden.folio;
  }
}

/**
 * Prepara los documentos e intenta imprimirlos. La impresora sigue simulada (`DispositivosService`);
 * si "imprime", se abre la vista de impresión con el documento real y el botón Imprimir del navegador.
 */
@Injectable({ providedIn: 'root' })
export class DocumentosService {
  private readonly dispositivos = inject(DispositivosService);
  private readonly ventas = inject(HistorialVentasService);
  private readonly ordenes = inject(OrdenesService);

  /** El documento en la vista de impresión. */
  readonly actual = signal<Documento | null>(null);

  imprimir(doc: Documento): boolean {
    if (!this.dispositivos.imprimir(folioDe(doc))) return false;
    this.actual.set(doc);
    return true;
  }

  /** Solo verlo (sin pasar por la impresora simulada). */
  ver(doc: Documento): void {
    this.actual.set(doc);
  }

  cerrar(): void {
    this.actual.set(null);
  }

  // Atajos con el estado más reciente de la venta u orden.
  venta(folio: string): boolean {
    const venta = this.ventas.ventas().find((v) => v.folio === folio);
    return venta ? this.imprimir({ tipo: 'venta', venta }) : this.dispositivos.imprimir(folio);
  }

  devolucion(folio: string): boolean {
    const venta = this.ventas.ventas().find((v) => v.folio === folio);
    return venta?.devoluciones.length ? this.imprimir({ tipo: 'devolucion', venta, indice: venta.devoluciones.length - 1 }) : this.dispositivos.imprimir(folio);
  }

  orden(folio: string, tipo: 'orden' | 'entrega' | 'garantia' = 'orden'): boolean {
    const orden = this.ordenes.ordenes().find((o) => o.folio === folio);
    if (!orden) return this.dispositivos.imprimir(folio);
    return this.imprimir(tipo === 'orden' ? { tipo, orden, formato: 'ticket' } : { tipo, orden });
  }

  /** DEV-0012: consecutivo de todas las devoluciones (las de prueba empiezan después de la 11). */
  folioDevolucion(venta: VentaRegistrada, indice: number): string {
    const fecha = venta.devoluciones[indice].fecha;
    const antes = this.ventas.ventas().flatMap((v) => v.devoluciones).filter((d) => d.fecha < fecha).length;
    return `DEV-${String(11 + antes + 1).padStart(4, '0')}`;
  }

  /** NC-0007: consecutivo de las notas de crédito. */
  folioNota(venta: VentaRegistrada, indice: number): string {
    const fecha = venta.devoluciones[indice].fecha;
    const antes = this.ventas.ventas().flatMap((v) => v.devoluciones).filter((d) => d.forma === 'nota' && d.fecha < fecha).length;
    return `NC-${String(6 + antes + 1).padStart(4, '0')}`;
  }
}
