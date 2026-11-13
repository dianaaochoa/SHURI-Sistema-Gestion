import { Component, HostListener, computed, inject, input, output } from '@angular/core';
import { formatearDinero } from '../../../compartido/formato';
import { EstadisticasService } from '../../../cajera/estadisticas/estadisticas.service';
import { FacturacionService, RFC_PUBLICO, serieFolio } from '../../facturacion.service';
import { Mes, dentro, exportarCsv } from '../../reportes';

/** AD6.3 · Factura global del mes a Público en general con lo que nadie facturó. */
@Component({
  selector: 'app-factura-global',
  standalone: true,
  templateUrl: './factura-global.component.html',
  styleUrls: ['../../../tecnico/banco/modal-banco.css'],
  styles: ['.modal { max-width: 600px; } .datos { display: flex; flex-direction: column; gap: 12px; } .aviso .icono { color: inherit; }'],
})
export class FacturaGlobalComponent {
  private readonly servicio = inject(FacturacionService);
  private readonly estadisticas = inject(EstadisticasService);

  readonly mes = input.required<Mes>();
  readonly cerrar = output<void>();
  readonly timbrada = output<string>();

  protected readonly calculo = computed(() => {
    const m = this.mes();
    const fin = new Date(m.desde.getFullYear(), m.desde.getMonth() + 1, 0);
    const corto = m.desde.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');
    const hoy = new Date();
    const enCurso = hoy <= new Date(fin.getFullYear(), fin.getMonth(), fin.getDate(), 23, 59, 59);
    const limite = new Date(fin.getFullYear(), fin.getMonth() + 1, 3, 23, 59, 59);
    const siguiente = new Date(fin.getFullYear(), fin.getMonth() + 1, 1).toLocaleDateString('es-MX', { month: 'long' });
    const d = this.estadisticas.suma(m.desde, m.hasta);
    const individuales = this.servicio.facturas().filter((f) => f.estado === 'timbrada' && !f.global && dentro(f.fecha, m));
    const facturado = individuales.reduce((s, f) => s + f.total, 0);
    const total = Math.max(0, Math.round((d.mostrador + d.reparaciones - facturado) * 100) / 100);
    const subtotal = Math.round((total / 1.16) * 100) / 100;
    const ya = this.servicio.globalDe(m.id);
    return {
      corto,
      enCurso,
      tarde: !enCurso && hoy > limite,
      siguiente,
      ya,
      total,
      datos: [
        ['Periodo', `1 – ${fin.getDate()} ${corto} ${fin.getFullYear()} · mensual${enCurso ? ' (en curso)' : ''}`],
        ['Tickets incluidos', `${d.ventas} ${d.ventas === 1 ? 'venta' : 'ventas'} y ${d.entregados} ${d.entregados === 1 ? 'entrega' : 'entregas'}`],
        ['Ya facturados por separado', `${individuales.length} (no se incluyen)`],
        ['Subtotal', formatearDinero(subtotal)],
        ['IVA 16%', formatearDinero(total - subtotal)],
        ['Total', formatearDinero(total)],
      ],
    };
  });

  protected readonly aviso = computed(() => {
    const c = this.calculo();
    if (c.ya) return { tono: 'exito', texto: `La factura global de ${this.mes().texto.toLowerCase()} ya se timbró (${serieFolio(c.ya)}). Para rehacerla, cancélala primero.` };
    if (c.enCurso) return { tono: 'advertencia', texto: `El mes sigue en curso: se podrá timbrar del 1 al 3 de ${c.siguiente}.` };
    if (c.tarde) return { tono: 'advertencia', texto: `Ya pasó el plazo (del 1 al 3 de ${c.siguiente}). Revisa con tu contador antes de timbrarla.` };
    return { tono: 'advertencia', texto: 'Se puede emitir del 1 al 3 del mes siguiente. Si un cliente pide su factura después, se excluye de esta global.' };
  });

  protected readonly bloqueada = computed(() => !!this.calculo().ya || this.calculo().enCurso || this.calculo().total <= 0);

  /** "Ver tickets incluidos": lo vendido y cobrado por día (CSV). */
  protected verTickets(): void {
    const m = this.mes();
    const filas: (string | number)[][] = [[`Factura global · ${m.texto}`], [], ['Día', 'Ventas', 'Entregas', 'Mostrador', 'Reparaciones']];
    for (let f = new Date(m.desde); f <= m.hasta; f.setDate(f.getDate() + 1)) {
      const d = this.estadisticas.suma(new Date(f), new Date(f));
      if (d.ventas || d.entregados) filas.push([f.toLocaleDateString('es-MX'), d.ventas, d.entregados, d.mostrador, d.reparaciones]);
    }
    exportarCsv(`tickets-global-${m.id}`, filas);
  }

  protected timbrar(): void {
    if (this.bloqueada()) return;
    const c = this.calculo();
    const folio = this.servicio.timbrar({ cliente: 'Público en general', rfc: RFC_PUBLICO, origen: `Global ${c.corto}`, total: c.total, pidio: 'Admin', global: this.mes().id });
    this.timbrada.emit(`Factura global de ${this.mes().texto.toLowerCase()} timbrada: ${folio} por ${formatearDinero(c.total)}.`);
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}
