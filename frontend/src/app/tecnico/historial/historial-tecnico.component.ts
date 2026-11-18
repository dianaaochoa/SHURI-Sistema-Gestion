import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../acceso/auth.service';
import { Orden, OrdenesService } from '../../cajera/ordenes/ordenes.service';
import { BancoService } from '../banco.service';
import { diaCorto, tecnicoDe } from '../mi-trabajo';
import { DetalleHistorialComponent } from './detalle-historial/detalle-historial.component';
import { duracionCorta, estadoGarantia, terminado } from './historial';

/** "2026-10" */
const mesDe = (iso: string) => iso.slice(0, 7);
const nombreMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  const texto = new Date(a, m - 1, 1).toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');
  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)} ${a}`;
};

/** T6.1 · Mi historial: equipos que terminó el técnico · T6.2 detalle de solo lectura (con ?folio=). */
@Component({
  selector: 'app-historial-tecnico',
  standalone: true,
  imports: [DetalleHistorialComponent],
  templateUrl: './historial-tecnico.component.html',
  styleUrls: ['../../jefe/lista-pagina.css', './historial-tecnico.component.css'],
})
export class HistorialTecnicoComponent {
  private readonly router = inject(Router);
  private readonly ordenes = inject(OrdenesService).ordenes;
  private readonly banco = inject(BancoService);
  private readonly tecnico = tecnicoDe(inject(AuthService).sesion()?.nombre);

  private readonly folio = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map((q) => q.get('folio'))), { initialValue: null });
  protected readonly busqueda = signal('');
  protected readonly mes = signal(mesDe(new Date().toISOString()));

  /** Todo lo que terminó, lo más reciente primero. */
  private readonly suyos = computed(() =>
    this.ordenes()
      .filter((o) => o.tecnico.iniciales === this.tecnico?.iniciales && terminado(o))
      .sort((a, b) => b.listaDesde!.localeCompare(a.listaDesde!)),
  );

  protected readonly viendo = computed(() => {
    const f = this.folio();
    return f ? (this.suyos().find((o) => o.folio === `#${f}`) ?? null) : null;
  });

  /** Meses con equipos terminados (y el actual aunque esté vacío). */
  protected readonly meses = computed(() => {
    const lista = new Set([mesDe(new Date().toISOString()), ...this.suyos().map((o) => mesDe(o.listaDesde!))]);
    return [...lista].sort().reverse().map((m) => ({ id: m, texto: nombreMes(m) }));
  });

  private readonly delMes = computed(() => this.suyos().filter((o) => mesDe(o.listaDesde!) === this.mes()));

  protected readonly filas = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    return this.delMes()
      .filter((o) => !q || [o.folio, o.cliente.nombre, o.equipo, o.imei].some((t) => t.toLowerCase().includes(q)))
      .map((o) => ({ o, terminado: diaCorto(o.listaDesde!), trabajo: o.trabajo, tiempo: duracionCorta(this.banco.tiempo(o.folio)), garantia: estadoGarantia(o) }));
  });

  protected readonly indicadores = computed(() => {
    const mes = this.delMes();
    const tiempos = mes.map((o) => this.banco.tiempo(o.folio)).filter(Boolean);
    const promedio = tiempos.length ? tiempos.reduce((s, t) => s + t, 0) / tiempos.length : 0;
    const enMes = (iso?: string) => !!iso && mesDe(iso) === this.mes();
    const recibidas = this.suyos().filter((o) => enMes(o.garantia?.recibida)).length;
    const aplicadas = this.suyos().filter((o) => o.garantia?.decision?.tipo === 'aplica' && enMes(o.garantia.decision.fecha)).length;
    const esActual = this.mes() === mesDe(new Date().toISOString());
    return [
      { valor: `${mes.length}`, tono: '', titulo: 'Equipos terminados', detalle: esActual ? 'Este mes' : nombreMes(this.mes()) },
      { valor: promedio ? duracionCorta(promedio) : '—', tono: 'primario', titulo: 'Tiempo promedio', detalle: 'Por reparación' },
      { valor: `${recibidas}`, tono: 'advertencia', titulo: 'Garantías recibidas', detalle: this.suyos().length ? `${Math.round((recibidas / this.suyos().length) * 100)}% de tus equipos` : 'Sin equipos terminados' },
      { valor: `${aplicadas}`, tono: 'peligro', titulo: 'Garantías aplicadas', detalle: 'Dictamen del jefe' },
    ];
  });

  protected ver(o: Orden): void {
    this.router.navigate(['/tecnico/mi-historial'], { queryParams: { folio: o.folio.replace('#', '') } });
  }

  protected volver(): void {
    this.router.navigate(['/tecnico/mi-historial']);
  }
}
