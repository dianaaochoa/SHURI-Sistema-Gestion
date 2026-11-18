import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatearDinero } from '../../../compartido/formato';
import { Orden } from '../../../cajera/ordenes/ordenes.service';
import { etapaGarantia } from '../../../jefe/garantias/garantia';
import { diaCorto, enCola, hace } from '../../mi-trabajo';
import { FichaEquipoComponent } from '../ficha-equipo/ficha-equipo.component';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });

/** T3.2 · Orden que espera al cliente o al jefe: no se repara todavía y se sugiere qué más trabajar. */
@Component({
  selector: 'app-espera-panel',
  standalone: true,
  imports: [RouterLink, FichaEquipoComponent],
  templateUrl: './espera-panel.component.html',
  styleUrls: ['../banco-comun.css', './espera-panel.component.css'],
})
export class EsperaPanelComponent {
  readonly orden = input.required<Orden>();
  /** Lo que el técnico puede trabajar mientras tanto. */
  readonly otras = input<Orden[]>([]);

  protected readonly revisarGarantia = computed(() => etapaGarantia(this.orden()) === 'en-revision');

  protected readonly aviso = computed(() => {
    const o = this.orden();
    const g = etapaGarantia(o);
    if (g === 'en-revision') return { titulo: 'Revisa esta garantía en Garantías', texto: 'Antes de repararla, el jefe necesita tu reporte: qué encontraste y si aplica la garantía.' };
    if (g === 'por-dictaminar') return { titulo: 'Tu reporte de garantía está con el jefe', texto: 'El jefe dictamina si aplica la garantía. Si la aprueba, la orden vuelve a tu banco para repararla sin costo.' };
    if (o.sinReparacion) return { titulo: 'Reportaste que no tiene reparación', texto: 'El jefe lo confirma antes de avisar al cliente. Arma el equipo como llegó mientras tanto.' };
    if (o.estado === 'por-aprobar')
      return { titulo: 'No repares este equipo todavía', texto: 'El cliente aún no autoriza el presupuesto. Cuando lo apruebe (en el portal o en caja), la orden pasará a “En taller” y recibirás un aviso.' };
    return { titulo: 'Diagnóstico enviado al jefe', texto: 'El jefe de técnicos arma el presupuesto y lo envía al cliente. No inicies la reparación hasta que el cliente autorice.' };
  });

  protected readonly lineas = computed(() => {
    const o = this.orden();
    if (o.garantia && o.estado === 'en-garantia') return [`Falla en garantía: ${o.garantia.falla}`, `Reparación original: ${o.trabajo}`];
    const lineas = [`Falla reportada: ${o.ficha?.falla || o.trabajo}`];
    if (o.diagnostico) lineas.push(`Tu diagnóstico (${diaCorto(o.diagnostico.fecha)}): ${o.diagnostico.resumen ?? o.diagnostico.texto}`);
    if (o.sinReparacion) lineas.push(`Sin reparación: ${o.sinReparacion.motivo} · ${o.sinReparacion.texto}`);
    return lineas;
  });

  /** Resumen de lo enviado: el presupuesto al cliente, el diagnóstico al jefe o el reporte de garantía. */
  protected readonly resumen = computed(() => {
    const o = this.orden();
    if (o.garantia?.reporte) {
      const r = o.garantia.reporte;
      return { titulo: 'Tu reporte de garantía', datos: [['Hallazgo', r.hallazgo], ['Relación con la reparación', r.relacion], ['Recomiendas', r.recomienda === 'aplica' ? 'Que aplique la garantía' : `Que no aplique (${r.motivo})`], ['Enviado', `${diaCorto(r.fecha)} ${hora(r.fecha)}`]] };
    }
    const conceptos = o.presupuesto?.conceptos ?? o.diagnostico?.conceptos ?? [];
    const piezas = conceptos.filter((c) => c.tipo !== 'mano-obra').map((c) => [c.descripcion, `${c.cantidad} pza`]);
    const mano = conceptos.find((c) => c.tipo === 'mano-obra');
    if (o.presupuesto) {
      return {
        titulo: 'Presupuesto enviado al cliente',
        datos: [...piezas, ...(mano ? [['Mano de obra', mano.detalle ?? formatearDinero(mano.precio)]] : []), ['Total para el cliente', formatearDinero(o.presupuesto.total)], ['Enviado', `${diaCorto(o.presupuesto.enviado)} ${hora(o.presupuesto.enviado)} · ${hace(o.presupuesto.enviado)}`]],
      };
    }
    if (o.diagnostico) {
      return {
        titulo: 'Diagnóstico enviado al jefe',
        datos: [['Causa', o.diagnostico.causa ?? '—'], ['Dificultad', o.diagnostico.dificultad ?? '—'], ...piezas, ...(mano ? [['Mano de obra', mano.detalle ?? '—']] : []), ['Enviado', `${diaCorto(o.diagnostico.fecha)} ${hora(o.diagnostico.fecha)} · ${hace(o.diagnostico.fecha)}`]],
      };
    }
    return null;
  });

  protected readonly sugeridas = computed(() => this.otras().map((o) => ({ o, folio: o.folio.replace('#', ''), ...enCola(o) })));
}
