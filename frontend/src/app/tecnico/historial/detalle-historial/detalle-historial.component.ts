import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Orden, diasGarantia } from '../../../cajera/ordenes/ordenes.service';
import { etapaGarantia } from '../../../jefe/garantias/garantia';
import { RefaccionesService } from '../../../jefe/refacciones/refacciones.service';
import { BancoService } from '../../banco.service';
import { FotosComponent } from '../../banco/fotos/fotos.component';
import { diaCorto } from '../../mi-trabajo';
import { duracionCorta, estadoGarantia, inicioGarantia } from '../historial';

const ESTADO: Record<string, { texto: string; tono: string }> = {
  lista: { texto: 'Listo para entregar', tono: 'info' },
  terminada: { texto: 'Terminado', tono: 'exito' },
  vencida: { texto: 'Sin recoger', tono: 'advertencia' },
  bodega: { texto: 'En bodega', tono: 'neutro' },
  'en-garantia': { texto: 'Terminado', tono: 'exito' },
  'garantia-lista': { texto: 'Garantía lista', tono: 'exito' },
};

/** T6.2 · Orden terminada, solo lectura: diagnóstico, trabajo, fotos, notas, piezas usadas y garantía. */
@Component({
  selector: 'app-detalle-historial',
  standalone: true,
  imports: [RouterLink, FotosComponent],
  templateUrl: './detalle-historial.component.html',
  styleUrls: ['../../banco/banco-comun.css', './detalle-historial.component.css'],
})
export class DetalleHistorialComponent {
  private readonly refacciones = inject(RefaccionesService);
  private readonly banco = inject(BancoService);

  readonly orden = input.required<Orden>();
  readonly volver = output<void>();

  protected readonly titulo = computed(() => {
    const f = this.orden().ficha;
    return f ? `${f.marca} ${f.modelo}`.trim() : this.orden().equipo;
  });

  protected readonly estado = computed(() => ESTADO[this.orden().estado] ?? { texto: 'Terminado', tono: 'exito' });
  protected readonly garantia = computed(() => estadoGarantia(this.orden()));
  protected readonly garantiaAbierta = computed(() => {
    const g = etapaGarantia(this.orden());
    return g === 'en-revision' || g === 'por-dictaminar';
  });

  protected readonly subtitulo = computed(() => {
    const o = this.orden();
    return `${o.cliente.nombre} · Recibido ${diaCorto(o.recibido)} · Terminado ${diaCorto(o.listaDesde!)} · Solo lectura`;
  });

  protected readonly trabajo = computed(() => {
    const o = this.orden();
    return [
      ['Falla reportada', o.ficha?.falla || o.trabajo],
      ['Diagnóstico', o.diagnostico?.resumen ?? o.diagnostico?.texto ?? '—'],
      ['Trabajo', o.realizado || o.trabajo],
      ['Pruebas finales', '6 de 6 aprobadas'],
      ['Tiempo de trabajo', duracionCorta(this.banco.tiempo(o.folio))],
    ];
  });

  /** Para el cliente lo que se hizo; las internas, la última nota del taller. */
  protected readonly notas = computed(() => {
    const o = this.orden();
    const interna = o.notas?.[o.notas.length - 1];
    return [o.realizado ? `Para el cliente: “${o.realizado}”` : '', interna ? `Interna: ${interna.texto}` : ''].filter(Boolean);
  });

  protected readonly piezas = computed(() => {
    const o = this.orden();
    const entregadas = this.refacciones.solicitudes().filter((s) => s.orden === o.folio && s.estado === 'entregada').map((s) => ({ nombre: s.nombre, detalle: `${s.sku} · ${s.cantidad} pza` }));
    if (entregadas.length) return entregadas;
    return (o.presupuesto?.conceptos ?? []).filter((c) => c.tipo === 'refaccion').map((c) => ({ nombre: c.descripcion, detalle: `${c.sku ?? '—'} · ${c.cantidad} pza` }));
  });

  protected readonly vigencia = computed(() => {
    const o = this.orden();
    const inicio = inicioGarantia(o);
    const datos = [['Cubre', `${o.realizado || o.trabajo} · ${diasGarantia()} días`]];
    if (inicio) {
      const fin = new Date(new Date(inicio).getTime() + diasGarantia() * 86_400_000).toISOString();
      const restan = Math.ceil((new Date(fin).getTime() - Date.now()) / 86_400_000);
      datos.push(['Vigencia', `${diaCorto(inicio)} – ${diaCorto(fin)} · ${restan > 0 ? `${restan} ${restan === 1 ? 'día restante' : 'días restantes'}` : 'vencida'}`]);
    } else datos.push(['Vigencia', 'Empieza al entregar el equipo']);
    if (o.garantia) datos.push(['Solicitud', `${diaCorto(o.garantia.recibida)} · “${o.garantia.falla.replace(/\.$/, '')}”`]);
    return datos;
  });
}
