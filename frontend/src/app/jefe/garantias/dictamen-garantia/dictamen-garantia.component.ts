import { Component, computed, input, output } from '@angular/core';
import { diasGarantia, Orden } from '../../../cajera/ordenes/ordenes.service';
import { formatearDinero, formatearHora } from '../../../compartido/formato';
import { diaMes } from '../../por-cotizar/existencia';
import { diasUsados, etapaGarantia, venceGarantia } from '../garantia';
import { TuDictamenComponent } from '../tu-dictamen/tu-dictamen.component';

/** J4.2 · Dictamen de garantía: reparación original, lo que reporta el cliente, reporte del técnico y tu dictamen. */
@Component({
  selector: 'app-dictamen-garantia',
  standalone: true,
  imports: [TuDictamenComponent],
  templateUrl: './dictamen-garantia.component.html',
  styleUrl: './dictamen-garantia.component.css',
})
export class DictamenGarantiaComponent {
  readonly orden = input.required<Orden>();
  readonly volver = output<void>();
  readonly publicado = output<string>();

  protected readonly diasGarantia = diasGarantia();
  protected readonly usados = computed(() => diasUsados(this.orden()));
  protected readonly enRevision = computed(() => etapaGarantia(this.orden()) === 'en-revision');

  protected readonly subtitulo = computed(() => {
    const o = this.orden();
    const g = o.garantia!;
    const pedida = new Date(g.recibida);
    const dia = pedida.toDateString() === new Date().toDateString() ? 'hoy' : diaMes(g.recibida);
    const partes = [o.cliente.nombre, o.equipo, `Solicitada ${dia} ${formatearHora(pedida)} ${g.recibio ? `en sucursal (${g.recibio})` : 'desde el portal'}`];
    if (g.reporte) partes.push(`Revisó ${o.tecnico.nombre}`);
    return partes.join(' · ');
  });

  protected readonly original = computed(() => {
    const o = this.orden();
    const vence = venceGarantia(o);
    const conceptos = o.presupuesto?.conceptos?.map((c) => c.descripcion.toLowerCase());
    const cubre = conceptos?.length ? `${conceptos.join(', ')} y mano de obra` : 'Refacciones y mano de obra';
    return [
      { texto: 'Trabajo', valor: o.presupuesto?.descripcion?.replace(/\.$/, '') || o.trabajo },
      { texto: 'Entregado', valor: o.entrega ? `${diaMes(o.entrega.fecha)} · ${formatearDinero(o.entrega.pagado)} · ${o.tecnico.nombre}` : '—' },
      { texto: 'Cubre', valor: `${cubre.charAt(0).toUpperCase()}${cubre.slice(1)}${vence ? ` · vence ${diaMes(vence)}` : ''}` },
    ];
  });

  protected readonly reporte = computed(() => {
    const r = this.orden().garantia?.reporte;
    if (!r) return null;
    return [
      { texto: 'Falla encontrada', valor: r.hallazgo },
      { texto: '¿Relacionada con la reparación?', valor: r.relacion },
      { texto: 'Señales de mal uso', valor: r.malUso },
      { texto: 'Trabajo necesario', valor: r.trabajo },
      { texto: 'Recomendación', valor: r.recomienda === 'aplica' ? 'Aplica (sin costo)' : `No aplica (costo extra${r.costo ? ` ${formatearDinero(r.costo)}` : ''})` },
    ];
  });
}
