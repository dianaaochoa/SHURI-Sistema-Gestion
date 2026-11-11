import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../acceso/auth.service';
import { Orden, OrdenesService, diasGarantia } from '../../cajera/ordenes/ordenes.service';
import { EtapaGarantia, diasUsados, etapaGarantia } from '../../jefe/garantias/garantia';
import { diaCorto, tecnicoDe } from '../mi-trabajo';
import { RevisionGarantiaComponent } from './revision-garantia/revision-garantia.component';

type Vista = 'todas' | 'en-revision' | 'por-dictaminar' | 'en-reparacion';

/** Cómo ve el técnico cada etapa (Figma T4.1). */
const ETAPAS: Record<EtapaGarantia, { texto: string; tono: string; accion: string }> = {
  'en-revision': { texto: 'Por revisar', tono: 'advertencia', accion: 'Revisar' },
  'por-dictaminar': { texto: 'Esperando dictamen', tono: 'info', accion: 'Ver reporte' },
  'en-reparacion': { texto: 'Garantía en reparación', tono: 'exito', accion: 'Abrir banco' },
  cerrada: { texto: 'Cerrada', tono: 'neutro', accion: 'Ver reporte' },
};

/** T4.1 · Garantías del técnico · T4.2 revisión y reporte para el jefe (con ?folio=). */
@Component({
  selector: 'app-garantias-tecnico',
  standalone: true,
  imports: [RevisionGarantiaComponent],
  templateUrl: './garantias-tecnico.component.html',
  styleUrls: ['../../jefe/lista-pagina.css', './garantias-tecnico.component.css'],
})
export class GarantiasTecnicoComponent {
  private readonly router = inject(Router);
  private readonly servicio = inject(OrdenesService);
  private readonly tecnico = tecnicoDe(inject(AuthService).sesion()?.nombre);

  private readonly folio = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map((q) => q.get('folio'))), { initialValue: null });
  protected readonly vista = signal<Vista>('todas');
  protected readonly aviso = signal('');

  /** Garantías de sus órdenes: las abiertas y las cerradas este mes. */
  private readonly suyas = computed(() => this.servicio.ordenes().filter((o) => o.garantia && o.tecnico.iniciales === this.tecnico?.iniciales));
  private readonly abiertas = computed(() => this.suyas().filter((o) => etapaGarantia(o) !== 'cerrada'));
  private readonly cerradasMes = computed(() => {
    const hoy = new Date();
    return this.suyas().filter((o) => {
      if (etapaGarantia(o) !== 'cerrada') return false;
      const f = new Date(o.garantia!.decision?.fecha ?? o.listaDesde ?? o.garantia!.recibida);
      return f.getMonth() === hoy.getMonth() && f.getFullYear() === hoy.getFullYear();
    });
  });
  private readonly de = (e: EtapaGarantia) => this.abiertas().filter((o) => etapaGarantia(o) === e);

  /** La garantía abierta en T4.2. */
  protected readonly revisando = computed(() => {
    const f = this.folio();
    return f ? (this.suyas().find((o) => o.folio === `#${f}`) ?? null) : null;
  });

  protected readonly indicadores = computed(() => [
    { vista: 'en-revision' as Vista, valor: this.de('en-revision').length, tono: 'advertencia', titulo: 'Por revisar', detalle: 'Asignadas a ti' },
    { vista: 'por-dictaminar' as Vista, valor: this.de('por-dictaminar').length, tono: 'primario', titulo: 'Esperando dictamen', detalle: 'Reporte enviado al jefe' },
    { vista: 'en-reparacion' as Vista, valor: this.de('en-reparacion').length, tono: 'exito', titulo: 'Garantía en reparación', detalle: 'Aprobada por el jefe' },
    { vista: 'todas' as Vista, valor: this.cerradasMes().length, tono: '', titulo: 'Cerradas este mes', detalle: 'Aplicadas o rechazadas' },
  ]);

  protected readonly pestanas = computed(() => [
    { id: 'todas' as Vista, texto: `Todas (${this.abiertas().length})` },
    { id: 'en-revision' as Vista, texto: 'Por revisar' },
    { id: 'por-dictaminar' as Vista, texto: 'Esperando dictamen' },
    { id: 'en-reparacion' as Vista, texto: 'En reparación' },
  ]);

  /** Primero las que hay que revisar y, dentro de cada etapa, las que se pidieron antes. */
  protected readonly renglones = computed(() => {
    const orden: EtapaGarantia[] = ['en-revision', 'por-dictaminar', 'en-reparacion'];
    const vista = this.vista();
    const lista = vista === 'todas' ? this.abiertas() : this.de(vista);
    return [...lista]
      .sort((a, b) => orden.indexOf(etapaGarantia(a)!) - orden.indexOf(etapaGarantia(b)!) || a.garantia!.recibida.localeCompare(b.garantia!.recibida))
      .map((o) => {
        const etapa = ETAPAS[etapaGarantia(o)!];
        return {
          o,
          etapa,
          falla: o.garantia!.falla.replace(/\.$/, ''),
          original: `${o.realizado || o.trabajo}${o.entrega ? ` · ${diaCorto(o.entrega.fecha)}` : ''}`,
          dias: etapaGarantia(o) === 'en-reparacion' ? 'Aprobada' : `${diasUsados(o)} de ${diasGarantia()}`,
        };
      });
  });

  protected elegir(v: Vista): void {
    this.vista.set(v);
  }

  protected abrir(o: Orden): void {
    const folio = o.folio.replace('#', '');
    if (etapaGarantia(o) === 'en-reparacion') this.router.navigate(['/tecnico/banco-de-trabajo'], { queryParams: { folio } });
    else this.router.navigate(['/tecnico/garantias'], { queryParams: { folio } });
  }

  protected volver(mensaje = ''): void {
    this.aviso.set(mensaje);
    this.router.navigate(['/tecnico/garantias']);
  }
}
