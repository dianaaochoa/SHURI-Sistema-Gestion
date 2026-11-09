import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { historialDemo } from '../../cajera/estadisticas/estadisticas.datos';
import { Orden, OrdenesService } from '../../cajera/ordenes/ordenes.service';
import { diaMes } from '../por-cotizar/existencia';
import { DictamenGarantiaComponent } from './dictamen-garantia/dictamen-garantia.component';
import { EtapaGarantia, etapaGarantia, recomendacion, venceGarantia } from './garantia';

interface Renglon {
  orden: Orden;
  original: string;
  recomendacion: { texto: string; tono: string };
  vence: string;
  accion: string;
}

const DIA = 86_400_000;

/** J4 · Garantías: J4.1 lista por etapa · J4.2 dictamen. */
@Component({
  selector: 'app-garantias',
  standalone: true,
  imports: [DictamenGarantiaComponent],
  templateUrl: './garantias.component.html',
  styleUrl: '../lista-pagina.css',
})
export class GarantiasComponent implements OnInit {
  private readonly servicio = inject(OrdenesService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly vista = signal<EtapaGarantia>('por-dictaminar');
  private readonly folio = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  private readonly conGarantia = computed(() => this.servicio.ordenes().filter((o) => o.garantia));
  private readonly de = (etapa: EtapaGarantia) => this.conGarantia().filter((o) => etapaGarantia(o) === etapa);

  /** Equipos entregados en los últimos 30 días según el historial de prueba de Estadísticas (C9). */
  private readonly entregadosDemo = historialDemo().slice(-30).reduce((s, d) => s + d.entregados, 0);

  /** Garantías pedidas en 30 días entre equipos entregados en 30 días (Figma J4.1 "Tasa de garantías"). */
  private readonly tasa = computed(() => {
    const desde = Date.now() - 30 * DIA;
    const ordenes = this.servicio.ordenes();
    const entregados = this.entregadosDemo + ordenes.filter((o) => o.entrega && new Date(o.entrega.fecha).getTime() >= desde).length;
    const garantias = ordenes.filter((o) => o.garantia && new Date(o.garantia.recibida).getTime() >= desde).length;
    return entregados ? Math.round((garantias / entregados) * 100) : 0;
  });

  protected readonly indicadores = computed(() => [
    { vista: 'por-dictaminar' as EtapaGarantia, valor: `${this.de('por-dictaminar').length}`, tono: 'advertencia', titulo: 'Por dictaminar', detalle: 'Reporte del técnico listo' },
    { vista: 'en-revision' as EtapaGarantia, valor: `${this.de('en-revision').length}`, tono: 'primario', titulo: 'En revisión', detalle: 'El técnico la está revisando' },
    { vista: 'en-reparacion' as EtapaGarantia, valor: `${this.de('en-reparacion').length}`, tono: 'exito', titulo: 'En reparación', detalle: 'Garantía aplicada' },
    { vista: 'cerrada' as EtapaGarantia, valor: `${this.tasa()}%`, tono: '', titulo: 'Tasa de garantías', detalle: 'Últimos 30 días' },
  ]);

  protected readonly pestanas = computed(() => [
    { id: 'por-dictaminar' as EtapaGarantia, texto: `Por dictaminar (${this.de('por-dictaminar').length})` },
    { id: 'en-revision' as EtapaGarantia, texto: `En revisión (${this.de('en-revision').length})` },
    { id: 'en-reparacion' as EtapaGarantia, texto: `En reparación (${this.de('en-reparacion').length})` },
    { id: 'cerrada' as EtapaGarantia, texto: 'Cerradas' },
  ]);

  protected readonly columnaRecomendacion = computed(() => (this.vista() === 'por-dictaminar' || this.vista() === 'en-revision' ? 'Recomendación del técnico' : 'Dictamen'));

  protected readonly renglones = computed<Renglon[]>(() =>
    this.de(this.vista())
      .sort((a, b) => b.garantia!.recibida.localeCompare(a.garantia!.recibida))
      .map((o) => {
        const vence = venceGarantia(o);
        const dictamen = o.garantia!.decision;
        let rec: { texto: string; tono: string };
        if (this.vista() === 'en-revision') rec = { texto: 'Revisando', tono: 'neutro' };
        else if (this.vista() === 'por-dictaminar') rec = recomendacion(o)!;
        else if (!dictamen) rec = { texto: o.garantia!.dictamen, tono: 'neutro' };
        else if (dictamen.tipo === 'aplica') rec = { texto: o.estado === 'en-garantia' ? 'Aplica · en reparación' : 'Aplica', tono: 'exito' };
        else if (dictamen.tipo === 'con-costo') rec = { texto: 'Con costo · espera al cliente', tono: 'advertencia' };
        else rec = { texto: 'No aplica · sin reparar', tono: 'peligro' };
        return {
          orden: o,
          original: o.entrega ? `${o.trabajo} · ${diaMes(o.entrega.fecha)}` : o.trabajo,
          recomendacion: rec,
          vence: vence ? diaMes(vence) : '—',
          accion: this.vista() === 'por-dictaminar' ? 'Dictaminar' : 'Ver orden',
        };
      }),
  );

  protected tecnicoCorto(o: Orden): string {
    const [nombre, apellido] = o.tecnico.nombre.split(' ');
    return apellido ? `${nombre} ${apellido[0]}.` : nombre;
  }

  // ---------- Dictamen (?folio=) ----------
  protected readonly orden = computed(() => this.servicio.ordenes().find((o) => o.folio === this.folio()) ?? null);

  ngOnInit(): void {
    this.ruta.queryParamMap.subscribe((q) => {
      const vista = q.get('vista') as EtapaGarantia | null;
      this.vista.set(vista && ['por-dictaminar', 'en-revision', 'en-reparacion', 'cerrada'].includes(vista) ? vista : 'por-dictaminar');
      const folio = q.get('folio');
      this.folio.set(folio ? `#${folio}` : null);
      // Solo se dictamina lo que tiene reporte; lo demás se ve en su detalle del tablero.
      const o = this.orden();
      if (o && etapaGarantia(o) !== 'por-dictaminar' && etapaGarantia(o) !== 'en-revision') this.router.navigate(['/jefe/tablero-de-ordenes'], { queryParams: { folio } });
    });
  }

  protected elegir(vista: EtapaGarantia): void {
    this.aviso.set(null);
    this.router.navigate([], { queryParams: { vista: vista === 'por-dictaminar' ? null : vista } });
  }

  protected abrir(o: Orden): void {
    this.aviso.set(null);
    const folio = o.folio.replace('#', '');
    if (this.vista() === 'por-dictaminar' || this.vista() === 'en-revision') this.router.navigate([], { queryParams: { folio, vista: this.vista() === 'en-revision' ? 'en-revision' : null } });
    else this.router.navigate(['/jefe/tablero-de-ordenes'], { queryParams: { folio } });
  }

  protected cerrar(mensaje: string | null = null): void {
    this.router.navigate([], { queryParams: { vista: this.vista() === 'por-dictaminar' ? null : this.vista() } });
    this.aviso.set(mensaje);
  }
}
