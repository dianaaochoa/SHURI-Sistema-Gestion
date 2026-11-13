import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { formatearDinero } from '../../compartido/formato';
import { CajaService } from '../../cajera/caja.service';
import { Corte, CorteService, diferencia, revisionDe } from '../../cajera/corte/corte.service';
import { Mes, dentro, exportarCsv, ultimosMeses } from '../reportes';
import { DetalleCorteComponent } from './detalle-corte/detalle-corte.component';

type Vista = 'por-revisar' | 'todos' | 'revisados';

const POR_PAGINA = 8;
const dia = (iso: string) => {
  const f = new Date(iso);
  return f.toDateString() === new Date().toDateString() ? 'Hoy' : `${f.getDate()} ${f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;
};
const pagos = (c: Corte) => c.desglose?.pagos ?? 0;

/** AD3.1 · Cortes de caja de todos los turnos · AD3.2 revisión de un corte (con ?folio=, o ?folio=vivo para el turno abierto). */
@Component({
  selector: 'app-cortes-admin',
  standalone: true,
  imports: [DetalleCorteComponent],
  templateUrl: './cortes-admin.component.html',
  styleUrls: ['../reportes.css', './cortes-admin.component.css'],
})
export class CortesAdminComponent {
  private readonly router = inject(Router);
  private readonly servicio = inject(CorteService);
  private readonly caja = inject(CajaService);

  private readonly folio = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map((q) => q.get('folio'))), { initialValue: null });
  protected readonly meses = ultimosMeses().slice(0, 3);
  protected readonly mesId = signal(this.meses[0].id);
  protected readonly mes = computed<Mes>(() => this.meses.find((m) => m.id === this.mesId())!);
  protected readonly vista = signal<Vista>('todos');
  protected readonly pagina = signal(0);
  protected readonly aviso = signal('');

  protected readonly viendo = computed(() => {
    const f = this.folio();
    if (!f) return null;
    if (f === 'vivo') return this.caja.abierta() ? 'vivo' : null;
    return this.servicio.cortes().find((c) => c.folio === f) ?? null;
  });

  /** El corte abierto en AD3.2 (null = el turno abierto, en vivo). */
  protected readonly corteVisto = computed(() => {
    const v = this.viendo();
    return v === 'vivo' ? null : v;
  });

  private readonly delMes = computed(() =>
    this.servicio
      .cortes()
      .filter((c) => dentro(c.hasta, this.mes()))
      .sort((a, b) => b.hasta.localeCompare(a.hasta)),
  );

  /** El turno abierto va arriba como "Hoy · Abierto" (solo en el mes actual). */
  protected readonly abierto = computed(() => {
    const t = this.caja.turno();
    if (!t || this.mesId() !== this.meses[0].id) return null;
    // El turno no guarda quién lo abrió (con la API vendrá en la sesión de caja).
    return { turno: t.turno, caja: t.caja, cajera: 'En turno', esperado: this.servicio.resumen().esperado };
  });

  private readonly filtrados = computed(() => {
    const v = this.vista();
    return this.delMes().filter((c) => (v === 'todos' ? true : v === 'por-revisar' ? revisionDe(c).pendiente : !revisionDe(c).pendiente));
  });

  protected readonly paginas = computed(() => Math.max(1, Math.ceil(this.filtrados().length / POR_PAGINA)));
  protected readonly numeros = computed(() => Array.from({ length: this.paginas() }, (_, i) => i));
  protected readonly total = computed(() => this.filtrados().length);
  protected readonly filas = computed(() =>
    this.filtrados()
      .slice(this.pagina() * POR_PAGINA, (this.pagina() + 1) * POR_PAGINA)
      .map((c) => {
        const dif = diferencia(c);
        const estado = revisionDe(c);
        return { c, dia: dia(c.hasta), dif, estado, pagos: pagos(c), accion: estado.pendiente && !c.revision ? 'Revisar' : 'Ver' };
      }),
  );

  protected readonly indicadores = computed(() => {
    const cortes = this.delMes();
    const difs = cortes.map(diferencia);
    const total = difs.reduce((s, d) => s + d, 0);
    const faltantes = difs.filter((d) => d < 0).length;
    const sobrantes = difs.filter((d) => d > 0).length;
    const turnos = new Set(cortes.map((c) => c.turno)).size;
    return [
      { valor: `${cortes.length}`, tono: '', titulo: 'Cortes en el mes', detalle: `Caja 01 · ${turnos} ${turnos === 1 ? 'turno' : 'turnos'}` },
      { valor: `${total < 0 ? '−' : total > 0 ? '+' : ''}${formatearDinero(Math.abs(total), true)}`, tono: total < 0 ? 'peligro' : 'exito', titulo: 'Diferencia acumulada', detalle: `${faltantes} ${faltantes === 1 ? 'faltante' : 'faltantes'} · ${sobrantes} ${sobrantes === 1 ? 'sobrante' : 'sobrantes'}` },
      { valor: `${cortes.filter((c) => revisionDe(c).pendiente).length}`, tono: 'advertencia', titulo: 'Por revisar', detalle: 'Con diferencia' },
      { valor: formatearDinero(cortes.reduce((s, c) => s + pagos(c), 0), true), tono: 'primario', titulo: 'Pagos a proveedor', detalle: 'Salieron de caja' },
    ];
  });

  protected readonly pestanas = computed(() => [
    { id: 'por-revisar' as Vista, texto: `Por revisar (${this.delMes().filter((c) => revisionDe(c).pendiente).length})` },
    { id: 'todos' as Vista, texto: 'Todos' },
    { id: 'revisados' as Vista, texto: 'Revisados' },
  ]);

  protected dinero(n: number): string {
    return formatearDinero(n);
  }

  protected elegir(v: Vista): void {
    this.vista.set(v);
    this.pagina.set(0);
  }

  protected cambiarMes(id: string): void {
    this.mesId.set(id);
    this.pagina.set(0);
  }

  protected abrir(folio: string): void {
    this.router.navigate(['/administrador/cortes-de-caja'], { queryParams: { folio } });
  }

  protected volver(mensaje = ''): void {
    this.aviso.set(mensaje);
    this.router.navigate(['/administrador/cortes-de-caja']);
  }

  protected exportar(): void {
    exportarCsv(`cortes-de-caja-${this.mes().id}`, [
      ['Folio', 'Fecha', 'Turno', 'Caja', 'Cajera', 'Esperado', 'Contado', 'Diferencia', 'Pagos a proveedor', 'Estado', 'Comentario'],
      ...this.delMes().map((c) => [c.folio, new Date(c.hasta).toLocaleDateString('es-MX'), c.turno, c.caja, c.cajera, c.esperado, c.contado, diferencia(c), pagos(c), revisionDe(c).texto, c.comentario]),
    ]);
  }
}
