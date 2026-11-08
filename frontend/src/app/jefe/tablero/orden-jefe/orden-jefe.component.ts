import { Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../acceso/auth.service';
import { ESTADOS_ORDEN, Orden, OrdenesService, PRIORIDADES, Prioridad } from '../../../cajera/ordenes/ordenes.service';
import { SeguimientoOrdenComponent } from '../../../cajera/ordenes/seguimiento-orden/seguimiento-orden.component';
import { formatearDinero, formatearHora } from '../../../compartido/formato';
import { SLA_DIAGNOSTICO_H, atrasada, horasDesde, tiempoEn } from '../../etapas';

/** J2.3 · Detalle de la orden para el jefe: seguimiento, pausa, resumen, fotos e historial con notas internas. */
@Component({
  selector: 'app-orden-jefe',
  standalone: true,
  imports: [RouterLink, SeguimientoOrdenComponent],
  templateUrl: './orden-jefe.component.html',
  styleUrl: './orden-jefe.component.css',
})
export class OrdenJefeComponent {
  private readonly servicio = inject(OrdenesService);
  private readonly jefe = inject(AuthService).sesion()?.nombre ?? '';

  readonly orden = input.required<Orden>();
  readonly aviso = input<string | null>(null);
  readonly volver = output<void>();
  readonly reasignar = output<void>();

  protected readonly prioridades = Object.entries(PRIORIDADES) as [Prioridad, (typeof PRIORIDADES)[Prioridad]][];
  protected readonly paso = computed(() => ESTADOS_ORDEN[this.orden().estado].paso);

  protected readonly titulo = computed(() => {
    const o = this.orden();
    const marca = o.ficha?.marca ?? (o.equipo.startsWith('iPhone') ? 'Apple' : '');
    return `Orden ${o.folio} · ${o.equipo.startsWith(marca) ? o.equipo : `${marca} ${o.equipo}`.trim()}`;
  });

  protected readonly subtitulo = computed(() => {
    const o = this.orden();
    const partes = [o.cliente.nombre, `Recibido ${fecha(o.recibido)}`];
    if (o.prometida) partes.push(`Prometido ${fecha(o.prometida)} ${formatearHora(new Date(o.prometida))}`);
    partes.push(`A cargo de: ${o.tecnico.nombre}`);
    return partes.join(' · ');
  });

  protected readonly estado = computed(() => {
    const o = this.orden();
    if (o.estado === 'esperando-refaccion') return { texto: 'En taller · En pausa', tono: 'neutro' };
    if (o.estado === 'por-cotizar') return o.diagnostico ? { texto: 'Diagnóstico listo · Por cotizar', tono: 'info' } : { texto: 'En diagnóstico', tono: 'info' };
    return ESTADOS_ORDEN[o.estado];
  });

  protected readonly pausa = computed(() => {
    const p = this.orden().pausa;
    if (!p || this.orden().estado !== 'esperando-refaccion') return null;
    return { titulo: `En pausa desde hace ${tiempoEn(p.desde)} · ${p.motivo}`, detalle: p.detalle, solicitud: p.detalle.match(/R-\d+/)?.[0] ?? null };
  });

  protected readonly atraso = computed(() =>
    atrasada(this.orden()) ? `Fuera de tiempo: ${Math.floor(horasDesde(this.orden().recibido))} h de ${SLA_DIAGNOSTICO_H} h para diagnosticar y cotizar.` : null,
  );

  protected readonly resumen = computed(() => {
    const o = this.orden();
    const p = o.presupuesto;
    return [
      { texto: 'Falla reportada', valor: o.ficha?.falla ?? o.trabajo },
      { texto: 'Diagnóstico', valor: o.diagnostico?.texto ?? p?.descripcion ?? 'Pendiente' },
      { texto: 'Trabajo autorizado', valor: p?.aprobado ? o.trabajo : 'Pendiente de aprobación' },
      { texto: 'Presupuesto', valor: p ? `${formatearDinero(p.total)} · ${p.aprobado ? `aprobado el ${fecha(p.aprobado)}` : `enviado el ${fecha(p.enviado)}`}` : 'Sin cotizar' },
      { texto: 'Prioridad', valor: PRIORIDADES[o.prioridad ?? 'normal'].texto },
    ];
  });

  /** Historial y notas internas, lo más reciente arriba. */
  protected readonly eventos = computed(() => {
    const o = this.orden();
    return [...o.historial.map((e) => ({ ...e, nota: false })), ...(o.notas ?? []).map((e) => ({ ...e, nota: true }))]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map((e) => ({ ...e, cuando: cuando(e.fecha) }));
  });

  protected readonly fotosTecnico = computed(() => (this.paso() > 2 || this.orden().diagnostico ? 2 : 0));

  // ---------- Cambiar prioridad ----------
  protected readonly cambiandoPrioridad = signal(false);
  protected readonly prioridadNueva = signal<Prioridad>('normal');

  protected abrirPrioridad(): void {
    this.prioridadNueva.set(this.orden().prioridad ?? 'normal');
    this.cambiandoPrioridad.set(true);
  }

  protected guardarPrioridad(): void {
    if (this.prioridadNueva() !== (this.orden().prioridad ?? 'normal')) this.servicio.cambiarPrioridad(this.orden().folio, this.prioridadNueva(), this.jefe);
    this.cambiandoPrioridad.set(false);
  }

  // ---------- Nota interna ----------
  protected readonly escribiendo = signal(false);
  protected readonly nota = signal('');
  private readonly campoNota = viewChild<ElementRef<HTMLTextAreaElement>>('campoNota');

  constructor() {
    effect(() => this.campoNota()?.nativeElement.focus());
  }

  protected guardarNota(): void {
    if (!this.nota().trim()) return;
    this.servicio.agregarNota(this.orden().folio, this.nota(), this.jefe);
    this.nota.set('');
    this.escribiendo.set(false);
  }
}

/** "13 oct" */
function fecha(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;
}

/** "Hoy 07:40" o "13 oct 12:00" */
function cuando(iso: string): string {
  const d = new Date(iso);
  const hoy = d.toDateString() === new Date().toDateString();
  return `${hoy ? 'Hoy' : fecha(iso)} ${formatearHora(d)}`;
}
