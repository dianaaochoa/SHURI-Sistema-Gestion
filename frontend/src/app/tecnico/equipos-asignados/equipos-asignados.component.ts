import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { formatearHora } from '../../compartido/formato';
import { Orden, OrdenesService, diasGarantia } from '../../cajera/ordenes/ordenes.service';
import { diasUsados, etapaGarantia } from '../../jefe/garantias/garantia';
import { etapaDe } from '../../jefe/etapas';
import { BancoService } from '../banco.service';
import { asignadas, diaCorto, hace, tecnicoDe } from '../mi-trabajo';

type Grupo = 'diagnostico' | 'por-cotizar' | 'por-aprobar' | 'en-taller' | 'garantia';
type Accion = 'Abrir banco' | 'Ver orden' | 'Revisar';

interface Fila {
  o: Orden;
  grupo: Grupo;
  falla: string;
  estado: { texto: string; tono: string };
  fecha: string;
  nota: string;
  alerta: boolean;
  accion: Accion;
  enCurso: boolean;
}

const GRUPOS: { id: Grupo; texto: string }[] = [
  { id: 'diagnostico', texto: 'Diagnóstico' },
  { id: 'por-cotizar', texto: 'Por cotizar' },
  { id: 'por-aprobar', texto: 'Por aprobar' },
  { id: 'en-taller', texto: 'En taller' },
  { id: 'garantia', texto: 'Garantía' },
];

const PRIORIDADES = [
  { id: 'normal', texto: 'Normal' },
  { id: 'alta', texto: 'Alta' },
  { id: 'urgente', texto: 'Urgente' },
];

/** "5 oct 2026" */
const diaLargo = (iso: string) => `${diaCorto(iso)} ${new Date(iso).getFullYear()}`;
const esHoy = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
const sinPunto = (t: string) => t.replace(/\.$/, '');

/** Estado, nota bajo la fecha y acción de una orden del técnico (Figma T2.1). */
function filaDe(o: Orden): Omit<Fila, 'enCurso'> {
  const base = { o, falla: sinPunto(o.ficha?.falla ?? o.trabajo), fecha: diaLargo(o.recibido), alerta: false };
  if (o.garantia && o.estado === 'en-garantia') {
    const g = etapaGarantia(o);
    const fecha = diaLargo(o.garantia.recibida);
    const falla = sinPunto(o.garantia.falla);
    if (g === 'en-revision')
      return { ...base, falla, fecha, grupo: 'garantia', estado: { texto: 'Garantía · revisar', tono: 'peligro' }, nota: `${diasUsados(o)} de ${diasGarantia()} días de garantía`, accion: 'Revisar' };
    if (g === 'por-dictaminar')
      return { ...base, falla, fecha, grupo: 'garantia', estado: { texto: 'Garantía · con el jefe', tono: 'advertencia' }, nota: 'Reporte enviado', accion: 'Ver orden' };
    return { ...base, falla, fecha, grupo: 'garantia', estado: { texto: 'Garantía · en taller', tono: 'exito' }, nota: o.garantia.decision ? `Aprobada por ${o.garantia.decision.por.split(' ')[0]}` : '', accion: 'Abrir banco' };
  }
  switch (etapaDe(o)) {
    case 'diagnostico':
      return { ...base, grupo: 'diagnostico', estado: { texto: 'Diagnóstico', tono: 'neutro' }, nota: esHoy(o.recibido) ? 'Recibido hoy' : `Recibido ${hace(o.recibido)}`, accion: 'Abrir banco' };
    case 'por-cotizar':
      return { ...base, grupo: 'por-cotizar', estado: { texto: 'Por cotizar', tono: 'neutro' }, nota: 'Diagnóstico enviado', accion: 'Ver orden' };
    case 'por-aprobar':
      return { ...base, grupo: 'por-aprobar', estado: { texto: 'Por aprobar', tono: 'advertencia' }, nota: 'Presupuesto enviado', accion: 'Ver orden' };
  }
  if (o.estado === 'adicional') return { ...base, grupo: 'en-taller', estado: { texto: 'Cargo adicional', tono: 'advertencia' }, nota: 'Adicional enviado al cliente', accion: 'Abrir banco' };
  if (o.estado === 'esperando-refaccion')
    return { ...base, grupo: 'en-taller', estado: { texto: 'En pausa · refacción', tono: 'neutro' }, nota: o.pausa?.detalle ?? 'Esperando refacción', accion: 'Ver orden' };
  return { ...base, grupo: 'en-taller', estado: { texto: 'En taller', tono: 'info' }, nota: o.presupuesto?.aprobado ? `Aprobado ${hace(o.presupuesto.aprobado)}` : 'Autorizado', accion: 'Abrir banco' };
}

/** T2.1 · Equipos asignados al técnico (T2.2: sin equipos). */
@Component({
  selector: 'app-equipos-asignados',
  standalone: true,
  templateUrl: './equipos-asignados.component.html',
  styleUrls: ['../../jefe/lista-pagina.css', './equipos-asignados.component.css'],
})
export class EquiposAsignadosComponent {
  private readonly router = inject(Router);
  private readonly ordenes = inject(OrdenesService).ordenes;
  private readonly banco = inject(BancoService);
  protected readonly tecnico = tecnicoDe(inject(AuthService).sesion()?.nombre);

  protected readonly grupos = GRUPOS;
  protected readonly prioridades = PRIORIDADES;
  protected readonly actualizado = formatearHora(new Date());

  protected readonly busqueda = signal('');
  protected readonly grupo = signal<Grupo | ''>('');
  protected readonly prioridad = signal('');

  private readonly enCursoFolio = computed(() => (this.tecnico ? this.banco.enCurso()[this.tecnico.iniciales]?.folio : undefined));

  /** Todas sus órdenes: la que trae en el banco primero y luego las más recientes. */
  private readonly todas = computed<Fila[]>(() => {
    const actual = this.enCursoFolio();
    return asignadas(this.tecnico, this.ordenes())
      .map((o) => {
        const fila: Fila = { ...filaDe(o), enCurso: o.folio === actual };
        if (fila.enCurso) {
          const desde = this.banco.enCurso()[this.tecnico!.iniciales].desde;
          const min = Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 60_000));
          fila.nota = `En curso · ${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
          fila.accion = 'Abrir banco';
        } else if (o.prometida && o.prioridad && o.prioridad !== 'normal') {
          fila.nota = `Prometido ${esHoy(o.prometida) ? 'hoy' : diaCorto(o.prometida)}`;
          fila.alerta = true;
        }
        return fila;
      })
      .sort((a, b) => Number(b.enCurso) - Number(a.enCurso) || (b.o.garantia?.recibida ?? b.o.recibido).localeCompare(a.o.garantia?.recibida ?? a.o.recibido));
  });

  protected readonly total = computed(() => this.todas().length);

  protected readonly filas = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    return this.todas().filter(
      (f) =>
        (!this.grupo() || f.grupo === this.grupo()) &&
        (!this.prioridad() || (f.o.prioridad ?? 'normal') === this.prioridad()) &&
        (!q || [f.o.folio, f.o.equipo, f.o.cliente.nombre, f.falla, f.estado.texto].some((t) => t.toLowerCase().includes(q))),
    );
  });

  protected readonly indicadores = computed(() => {
    const t = this.todas();
    const cuenta = (g: Grupo) => t.filter((f) => f.grupo === g).length;
    const porAprobar = cuenta('por-aprobar');
    const revisar = t.filter((f) => f.accion === 'Revisar').length;
    const pausa = t.filter((f) => f.o.estado === 'esperando-refaccion').length;
    return [
      { grupo: '' as const, valor: t.length, titulo: 'Asignadas a ti', detalle: porAprobar ? `${porAprobar} esperando aprobación` : 'Ninguna esperando aprobación' },
      { grupo: 'por-cotizar' as const, valor: cuenta('por-cotizar'), titulo: 'Por cotizar', detalle: 'Esperando al jefe' },
      { grupo: 'garantia' as const, valor: cuenta('garantia'), titulo: 'Garantías', detalle: revisar ? `${revisar} por revisar` : 'Ninguna por revisar' },
      { grupo: 'en-taller' as const, valor: cuenta('en-taller'), titulo: 'En taller', detalle: pausa ? `${pausa} en pausa por refacción` : 'Ninguno en pausa' },
    ];
  });

  /** La última nota del equipo en curso, como en Figma ("#1029 · Módulo USB-C reemplazado…"). */
  protected readonly ultimaNota = computed(() => {
    const o = this.todas().find((f) => f.enCurso)?.o;
    const nota = o?.notas?.[o.notas.length - 1];
    return o && nota ? `${o.folio} · ${sinPunto(nota.texto)}. Consulta las notas completas en el banco de trabajo.` : '';
  });

  protected readonly hayFiltros = computed(() => !!(this.busqueda().trim() || this.grupo() || this.prioridad()));

  protected limpiar(): void {
    this.busqueda.set('');
    this.grupo.set('');
    this.prioridad.set('');
  }

  protected abrir(f: Fila): void {
    const ruta = f.accion === 'Revisar' ? 'garantias' : 'banco-de-trabajo';
    this.router.navigate(['/tecnico', ruta], { queryParams: { folio: f.o.folio.replace('#', '') } });
  }
}
