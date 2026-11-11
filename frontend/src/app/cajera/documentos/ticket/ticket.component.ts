import { Component, computed, inject, input } from '@angular/core';
import { formatearDinero, formatearFechaCorta, formatearHora } from '../../../compartido/formato';
import { diasGarantia, Orden, sumarDias } from '../../ordenes/ordenes.service';
import { calcularTotales, totalLinea } from '../../punto-de-venta/venta.service';
import { VentaRegistrada, importeDevolucion } from '../../ventas/historial-ventas.service';
import { Documento, DocumentosService, NEGOCIO } from '../documentos.service';

const METODOS: Record<string, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', mixto: 'Mixto' };
const REEMBOLSO: Record<string, string> = { efectivo: 'Efectivo', tarjeta: 'A la tarjeta', nota: 'Nota de crédito', cambio: 'Cambio por otro producto' };

/** C11 · Tickets de 80 mm: venta, orden, entrega, devolución, garantía, corte y retiro. */
@Component({
  selector: 'app-ticket',
  standalone: true,
  templateUrl: './ticket.component.html',
  styleUrl: './ticket.component.css',
})
export class TicketComponent {
  private readonly documentos = inject(DocumentosService);
  readonly doc = input.required<Documento>();

  protected readonly negocio = NEGOCIO;
  protected readonly metodos = METODOS;
  protected readonly reembolso = REEMBOLSO;
  protected readonly totalLinea = totalLinea;

  protected dinero(importe: number): string {
    const texto = formatearDinero(Math.abs(importe));
    return importe < 0 ? `− ${texto}` : texto;
  }

  /** 12 oct 2026 · 13:42 */
  protected fechaHora(iso: string): string {
    const f = new Date(iso);
    return `${formatearFechaCorta(f)} · ${formatearHora(f)}`;
  }

  /** 13 oct */
  protected diaMes(iso: string): string {
    return formatearFechaCorta(new Date(iso)).replace(/ \d{4}$/, '');
  }

  protected hora(iso: string): string {
    return formatearHora(new Date(iso));
  }

  // ---------- Venta ----------
  protected readonly totales = computed(() => {
    const d = this.doc();
    if (d.tipo !== 'venta') return null;
    const t = calcularTotales(d.venta.lineas, d.venta.descuento);
    return { ...t, articulos: d.venta.lineas.reduce((s, l) => s + l.cantidad, 0), descuentoVenta: Math.round((t.subtotalLineas - t.subtotal) * 100) / 100 };
  });

  // ---------- Órdenes ----------
  protected cajeraDe(o: Orden): string {
    return o.ficha?.recibio ?? o.historial[0]?.texto.replace(/^Recibido por /, '') ?? '';
  }

  protected equipoDe(o: Orden): string {
    return o.ficha ? `${o.ficha.tipo} · ${o.ficha.marca} ${o.ficha.modelo}`.trim() : o.equipo;
  }

  protected colorDe(o: Orden): string {
    return o.ficha?.color ? o.ficha.color.toLowerCase() : '';
  }

  protected metodo(m?: string): string {
    return m ? (METODOS[m] ?? m.charAt(0).toUpperCase() + m.slice(1)) : '—';
  }

  /** Garantía de la entrega: del día de entrega a 30 días después. */
  protected garantiaHasta(o: Orden): string {
    return o.entrega ? formatearFechaCorta(new Date(sumarDias(o.entrega.fecha, diasGarantia()))) : '';
  }

  protected venceGarantia(o: Orden): string {
    return sumarDias(o.entrega!.fecha, diasGarantia());
  }

  protected diasGarantia(o: Orden): number {
    if (!o.entrega || !o.garantia) return 0;
    const vence = new Date(sumarDias(o.entrega.fecha, diasGarantia())).getTime();
    return Math.max(0, Math.ceil((vence - new Date(o.garantia.recibida).getTime()) / 86_400_000));
  }

  // ---------- Devolución ----------
  protected folioDevolucion(v: VentaRegistrada, i: number): string {
    return this.documentos.folioDevolucion(v, i);
  }

  protected folioNota(v: VentaRegistrada, i: number): string {
    return this.documentos.folioNota(v, i);
  }

  protected articulosDevueltos(v: VentaRegistrada, i: number) {
    return v.devoluciones[i].articulos.map((a) => ({
      ...a,
      nombre: v.lineas.find((l) => l.sku === a.sku)?.nombre ?? a.sku,
      importe: importeDevolucion(v, a.sku, a.cantidad),
    }));
  }

  /** Vigencia de la nota de crédito: 90 días. */
  protected vigenciaNota(iso: string): string {
    return formatearFechaCorta(new Date(sumarDias(iso, 90)));
  }
}
