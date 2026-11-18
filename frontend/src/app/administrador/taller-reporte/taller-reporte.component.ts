import { Component, computed, inject, signal } from '@angular/core';
import { formatearDinero } from '../../compartido/formato';
import { REGLAS_TALLER } from '../../compartido/reglas-taller';
import { EstadisticasService } from '../../cajera/estadisticas/estadisticas.service';
import { OrdenesService, TECNICOS } from '../../cajera/ordenes/ordenes.service';
import { EN_TALLER } from '../../jefe/tecnicos/carga';
import { BancoService } from '../../tecnico/banco.service';
import { duracionCorta, terminado } from '../../tecnico/historial/historial';
import { META_GARANTIAS } from '../negocio';
import { Mes, dentro, exportarCsv, ultimosMeses } from '../reportes';

const HORA = 3_600_000;
/** 5.33 h → "5 h 20" */
const horas = (h: number) => (h ? `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}` : '—');

/** AD2.2 · Desempeño del taller: órdenes, tiempos, presupuestos, garantías y técnicos del mes. */
@Component({
  selector: 'app-taller-reporte',
  standalone: true,
  templateUrl: './taller-reporte.component.html',
  styleUrls: ['../reportes.css', './taller-reporte.component.css'],
})
export class TallerReporteComponent {
  private readonly ordenes = inject(OrdenesService).ordenes;
  private readonly estadisticas = inject(EstadisticasService);
  private readonly banco = inject(BancoService);

  protected readonly meses = ultimosMeses();
  protected readonly mesId = signal(this.meses[0].id);
  protected readonly mes = computed<Mes>(() => this.meses.find((m) => m.id === this.mesId())!);

  private readonly en = (iso: string | undefined) => dentro(iso, this.mes());

  protected readonly indicadores = computed(() => {
    const o = this.ordenes();
    const recibidas = o.filter((x) => this.en(x.recibido)).length;
    const entregadas = o.filter((x) => this.en(x.entrega?.fecha)).length;
    const aprobados = o.filter((x) => this.en(x.presupuesto?.aprobado)).length;
    const rechazados = o.filter((x) => this.en(x.rechazo)).length;
    const cotizadas = o.filter((x) => this.en(x.presupuesto?.enviado));
    const tiempos = cotizadas.map((x) => (new Date(x.presupuesto!.enviado).getTime() - new Date(x.recibido).getTime()) / HORA);
    const promedio = tiempos.length ? tiempos.reduce((s, t) => s + t, 0) / tiempos.length : 0;
    const fuera = tiempos.filter((t) => t > REGLAS_TALLER.slaDiagnosticoH).length;
    const tasa = this.tasaGarantias();
    return [
      { valor: `${recibidas}`, tono: '', titulo: 'Órdenes recibidas', detalle: `${entregadas} ${entregadas === 1 ? 'entregada' : 'entregadas'}` },
      { valor: aprobados + rechazados ? `${Math.round((aprobados / (aprobados + rechazados)) * 100)}%` : '—', tono: 'exito', titulo: 'Presupuestos aprobados', detalle: `${rechazados} ${rechazados === 1 ? 'rechazado' : 'rechazados'}` },
      { valor: horas(promedio), tono: 'primario', titulo: 'Tiempo a cotizar', detalle: `SLA ${REGLAS_TALLER.slaDiagnosticoH} h · ${fuera} ${fuera === 1 ? 'atrasada' : 'atrasadas'}` },
      { valor: `${tasa}%`, tono: tasa >= META_GARANTIAS ? 'peligro' : 'exito', titulo: 'Garantías', detalle: `Meta: menos de ${META_GARANTIAS}%` },
    ];
  });

  /** Garantías pedidas en el mes entre equipos entregados en el mes (mismo cálculo que AD1 y J4). */
  private readonly tasaGarantias = computed(() => {
    const entregados = this.estadisticas.suma(this.mes().desde, this.mes().hasta).entregados;
    const pedidas = this.ordenes().filter((x) => this.en(x.garantia?.recibida)).length;
    return entregados ? Math.round((pedidas / entregados) * 100) : 0;
  });

  protected readonly tecnicos = computed(() =>
    TECNICOS.map((t) => {
      const suyas = this.ordenes().filter((o) => o.tecnico.iniciales === t.iniciales);
      const terminadas = suyas.filter((o) => this.en(o.listaDesde) && !o.trabajo.startsWith('Sin reparación'));
      const tiempos = terminadas.map((o) => this.banco.tiempo(o.folio)).filter(Boolean);
      const garantias = suyas.filter((o) => this.en(o.garantia?.recibida)).length;
      // Sobre todo lo que ha terminado (las garantías del mes son de reparaciones de meses anteriores).
      const historico = suyas.filter(terminado).length;
      const pct = historico ? Math.round((garantias / historico) * 100) : 0;
      const enPausa = suyas.filter((o) => o.pausa || o.estado === 'esperando-refaccion').length;
      return {
        nombre: t.nombre,
        terminadas: terminadas.length,
        ingreso: terminadas.reduce((s, o) => s + (o.presupuesto?.total ?? o.entrega?.pagado ?? 0), 0),
        tiempo: tiempos.length ? duracionCorta(tiempos.reduce((s, x) => s + x, 0) / tiempos.length) : '—',
        pausa: enPausa ? `${enPausa} ${enPausa === 1 ? 'orden ahora' : 'órdenes ahora'}` : '—',
        garantias: { texto: `${garantias} · ${pct}%`, tono: !garantias ? 'exito' : pct >= META_GARANTIAS ? 'advertencia' : 'exito' },
        aplicadas: suyas.filter((o) => o.garantia?.decision?.tipo === 'aplica' && this.en(o.garantia.decision.fecha)).length,
        estado: garantias && pct >= META_GARANTIAS ? { texto: 'Revisar', tono: 'advertencia' } : { texto: 'Bien', tono: 'exito' },
      };
    }),
  );

  protected readonly resultados = computed(() => {
    const o = this.ordenes();
    const lista = [
      { texto: 'Entregadas', valor: o.filter((x) => this.en(x.entrega?.fecha)).length, fuerte: true },
      { texto: 'Rechazadas', valor: o.filter((x) => this.en(x.rechazo)).length, fuerte: false },
      { texto: 'Sin reparación', valor: o.filter((x) => !x.rechazo && x.trabajo.startsWith('Sin reparación') && this.en(x.listaDesde)).length, fuerte: false },
      { texto: 'Garantía', valor: o.filter((x) => this.en(x.garantia?.recibida)).length, fuerte: false },
      { texto: 'En proceso', valor: o.filter((x) => EN_TALLER.includes(x.estado) && this.en(x.recibido)).length, fuerte: false },
    ];
    const mayor = Math.max(1, ...lista.map((r) => r.valor));
    return lista.map((r) => ({ ...r, alto: Math.max(3, Math.round((r.valor / mayor) * 100)) }));
  });

  /** Motivos que dejó el cliente al rechazar (en caja quedan en el historial: Rechazado … “motivo”). */
  protected readonly motivos = computed(() => {
    const conteo = new Map<string, number>();
    for (const o of this.ordenes()) {
      for (const e of o.historial) {
        if (!e.texto.includes('echazad') || !this.en(e.fecha)) continue;
        const motivo = e.texto.match(/“(.+)”/)?.[1] ?? 'Sin motivo';
        conteo.set(motivo, (conteo.get(motivo) ?? 0) + 1);
      }
    }
    return [...conteo.entries()].sort((a, b) => b[1] - a[1]).map(([texto, valor]) => ({ texto, valor }));
  });

  protected dinero(n: number): string {
    return formatearDinero(n, true);
  }

  protected exportar(): void {
    exportarCsv(`desempeno-del-taller-${this.mes().id}`, [
      [`Desempeño del taller · ${this.mes().texto}`],
      [],
      ...this.indicadores().map((i) => [i.titulo, i.valor, i.detalle]),
      [],
      ['Técnico', 'Terminadas', 'Ingreso generado', 'Tiempo promedio', 'En pausa', 'Garantías', 'Aplicadas sin costo', 'Estado'],
      ...this.tecnicos().map((t) => [t.nombre, t.terminadas, Math.round(t.ingreso), t.tiempo, t.pausa, t.garantias.texto, t.aplicadas, t.estado.texto]),
      [],
      ['Resultado', 'Órdenes'],
      ...this.resultados().map((r) => [r.texto, r.valor]),
    ]);
  }
}
