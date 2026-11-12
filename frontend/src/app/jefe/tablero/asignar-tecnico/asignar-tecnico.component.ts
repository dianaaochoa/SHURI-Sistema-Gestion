import { Component, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { Orden, OrdenesService, POR_ASIGNAR, PRIORIDADES, Prioridad, TECNICOS, Tecnico } from '../../../cajera/ordenes/ordenes.service';
import { etapaDe } from '../../etapas';

export interface Asignacion {
  tecnico: Tecnico;
  prioridad: Prioridad;
  /** ISO */
  prometida: string;
  nota: string;
}

/** Con 5 órdenes o más el técnico tiene "carga alta" (Figma J2.2). */
const CARGA_ALTA = 5;

/** J2.2 · Asignar (o reasignar) técnico. */
@Component({
  selector: 'app-asignar-tecnico',
  standalone: true,
  templateUrl: './asignar-tecnico.component.html',
  styleUrl: './asignar-tecnico.component.css',
})
export class AsignarTecnicoComponent {
  private readonly ordenes = inject(OrdenesService).ordenes;

  readonly orden = input.required<Orden>();
  readonly cerrar = output<void>();
  readonly asignar = output<Asignacion>();

  protected readonly prioridades = Object.entries(PRIORIDADES) as [Prioridad, (typeof PRIORIDADES)[Prioridad]][];
  protected readonly reasigna = computed(() => this.orden().tecnico !== POR_ASIGNAR);

  /** Órdenes de cada técnico que siguen en el taller (sin contar las listas para entregar). */
  protected readonly opciones = computed(() => {
    const equipo = this.orden().equipo.toLowerCase();
    const lista = TECNICOS.map((t) => {
      const suyas = this.ordenes().filter((o) => o.tecnico.iniciales === t.iniciales && o.folio !== this.orden().folio);
      const activas = suyas.filter((o) => {
        const e = etapaDe(o);
        return e && e !== 'listo';
      });
      const diagnostico = activas.filter((o) => etapaDe(o) === 'diagnostico').length;
      const pausa = activas.filter((o) => o.estado === 'esperando-refaccion').length;
      const especialista = !!t.especialidad && equipo.includes(t.especialidad.toLowerCase());
      const partes = [`${activas.length} ${activas.length === 1 ? 'orden' : 'órdenes'}`];
      if (activas.length >= CARGA_ALTA) partes.push('carga alta');
      else {
        if (diagnostico) partes.push(`${diagnostico} en diagnóstico`);
        if (pausa) partes.push(`${pausa} en pausa`);
      }
      if (especialista) partes.push(`especialidad ${t.especialidad}`);
      return { tecnico: t, carga: activas.length, especialista, detalle: partes.join(' · '), actual: t.iniciales === this.orden().tecnico.iniciales };
    });
    // Recomendado: sin carga alta, primero el especialista y luego el de menos órdenes.
    const recomendado = [...lista]
      .filter((o) => !o.actual)
      .sort((a, b) => Number(a.carga >= CARGA_ALTA) - Number(b.carga >= CARGA_ALTA) || Number(b.especialista) - Number(a.especialista) || a.carga - b.carga)[0];
    return lista
      .map((o) => ({ ...o, recomendado: o === recomendado }))
      .sort((a, b) => Number(b.recomendado) - Number(a.recomendado) || a.carga - b.carga);
  });

  protected readonly elegido = signal<string | null>(null);
  protected readonly tecnico = computed(() => this.elegido() ?? this.opciones()[0]?.tecnico.iniciales ?? '');
  protected readonly nombre = computed(() => TECNICOS.find((t) => t.iniciales === this.tecnico())?.nombre ?? '');

  protected readonly prioridad = signal<Prioridad | null>(null);
  protected readonly prioridadElegida = computed(() => this.prioridad() ?? this.orden().prioridad ?? 'normal');

  /** Por defecto: lo ya prometido o dos días después de recibir, a las 18:00. */
  protected readonly prometida = signal<string | null>(null);
  protected readonly prometidaElegida = computed(() => {
    if (this.prometida() !== null) return this.prometida()!;
    const base = this.orden().prometida ? new Date(this.orden().prometida!) : new Date(new Date(this.orden().recibido).getTime() + 2 * 86_400_000);
    if (!this.orden().prometida) base.setHours(18, 0, 0, 0);
    return paraInput(base);
  });
  protected readonly nota = signal('');

  protected readonly valido = computed(() => !!this.tecnico() && !!this.prometidaElegida() && !this.opciones().find((o) => o.tecnico.iniciales === this.tecnico())?.actual);

  protected confirmar(): void {
    const tecnico = TECNICOS.find((t) => t.iniciales === this.tecnico());
    if (!tecnico || !this.valido()) return;
    this.asignar.emit({ tecnico, prioridad: this.prioridadElegida(), prometida: new Date(this.prometidaElegida()).toISOString(), nota: this.nota() });
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}

/** "2026-11-10T18:00" para <input type="datetime-local">. */
function paraInput(fecha: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}T${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`;
}
