import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../acceso/auth.service';
import { InventarioService } from '../../cajera/inventario/inventario.service';
import { Concepto, Orden, OrdenesService } from '../../cajera/ordenes/ordenes.service';
import { etapaGarantia } from '../../jefe/garantias/garantia';
import { etapaDe } from '../../jefe/etapas';
import { PREGUNTAS_TECNICOS } from '../../jefe/jefe.datos';
import { BancoService } from '../banco.service';
import { asignadas, cronometro, diaCorto, hace, porDevolver, tecnicoDe, trabajable } from '../mi-trabajo';
import { DanoAdicionalComponent } from './dano-adicional/dano-adicional.component';
import { DevolverPanelComponent } from './devolver-panel/devolver-panel.component';
import { DiagnosticoEnviado, DiagnosticoPanelComponent } from './diagnostico-panel/diagnostico-panel.component';
import { EsperaPanelComponent } from './espera-panel/espera-panel.component';
import { MarcarListoComponent } from './marcar-listo/marcar-listo.component';
import { NecesitoInfoComponent } from './necesito-info/necesito-info.component';
import { OrdenEnCursoComponent } from './orden-en-curso/orden-en-curso.component';
import { PausarComponent } from './pausar/pausar.component';
import { SinReparacionComponent } from './sin-reparacion/sin-reparacion.component';
import { TallerPanelComponent } from './taller-panel/taller-panel.component';
import { TallerTabletComponent } from './taller-tablet/taller-tablet.component';
import { enTablet } from '../tablet';

type Modo = 'diagnostico' | 'espera' | 'taller' | 'devolver';
type Modal = 'pausar' | 'info' | 'sin' | 'dano' | 'listo' | 'en-curso' | null;

const PASOS = ['Recibido', 'Diagnóstico', 'Aprobación', 'En taller', 'Listo', 'Terminado'];
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
const cuando = (iso: string) => `${new Date(iso).toDateString() === new Date().toDateString() ? 'hoy' : `el ${diaCorto(iso)}`} ${hora(iso)}`;
/** 72 → "1 h 12 min" */
const duracion = (ms: number) => {
  const min = Math.max(1, Math.round(ms / 60_000));
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
};

/** T3 · Banco de trabajo del técnico: una pantalla por etapa de la orden y sus modales (T3.1–T3.11). */
@Component({
  selector: 'app-banco',
  standalone: true,
  imports: [
    RouterLink,
    DiagnosticoPanelComponent,
    EsperaPanelComponent,
    TallerPanelComponent,
    TallerTabletComponent,
    DevolverPanelComponent,
    PausarComponent,
    NecesitoInfoComponent,
    SinReparacionComponent,
    DanoAdicionalComponent,
    MarcarListoComponent,
    OrdenEnCursoComponent,
  ],
  templateUrl: './banco.component.html',
  styleUrl: './banco.component.css',
})
export class BancoComponent {
  private readonly router = inject(Router);
  private readonly servicio = inject(OrdenesService);
  private readonly inventario = inject(InventarioService);
  protected readonly banco = inject(BancoService);
  private readonly nombre = inject(AuthService).sesion()?.nombre ?? '';
  private readonly tecnico = tecnicoDe(this.nombre);
  private readonly iniciales = this.tecnico?.iniciales ?? '';

  private readonly folio = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map((q) => q.get('folio'))), { initialValue: null });

  protected readonly pasos = PASOS;
  protected readonly modal = signal<Modal>(null);
  protected readonly mensaje = signal('');
  private ocultar?: ReturnType<typeof setTimeout>;

  private readonly mias = computed(() => asignadas(this.tecnico, this.servicio.ordenes()));

  /** La orden pedida (?folio=), la que trae en curso o la primera que puede trabajar. */
  protected readonly orden = computed<Orden | null>(() => {
    const pedido = this.folio();
    if (pedido) return this.mias().find((o) => o.folio === `#${pedido}`) ?? null;
    const actual = this.banco.enCurso()[this.iniciales];
    return this.mias().find((o) => o.folio === actual) ?? this.mias().find(trabajable) ?? null;
  });

  protected readonly noEsSuya = computed(() => !!this.folio() && !this.orden());

  /** Figma T7: en tablet la reparación se ve con pestañas y botones grandes, sin la barra de etapas. */
  private readonly tablet = enTablet();
  protected readonly compacto = computed(() => this.tablet() && !!this.orden() && this.modo() === 'taller');
  /** "#1029 · Samsung S21" */
  protected readonly tituloCorto = computed(() => {
    const o = this.orden()!;
    return `${o.folio} · ${o.ficha ? `${o.ficha.marca} ${o.ficha.modelo}`.trim() : o.equipo}`;
  });
  /** "Andrés Vega · En taller · Autorizado · PIN 2580" */
  protected readonly subtituloCorto = computed(() => {
    const o = this.orden()!;
    return `${o.cliente.nombre} · ${this.estado().texto} · PIN ${o.ficha?.pin || '—'}`;
  });

  protected readonly modo = computed<Modo>(() => {
    const o = this.orden()!;
    if (porDevolver(o)) return 'devolver';
    if (o.estado === 'en-garantia') return etapaGarantia(o) === 'en-reparacion' ? 'taller' : 'espera';
    if (etapaDe(o) === 'diagnostico' && !o.sinReparacion) return 'diagnostico';
    if (['en-taller', 'adicional', 'esperando-refaccion'].includes(o.estado)) return 'taller';
    return 'espera';
  });

  protected readonly estado = computed(() => {
    const o = this.orden()!;
    const g = etapaGarantia(o);
    switch (this.modo()) {
      case 'diagnostico':
        return o.pausa ? { texto: 'Diagnóstico · en pausa', tono: 'neutro' } : { texto: 'En diagnóstico', tono: 'info' };
      case 'devolver':
        return { texto: 'Presupuesto rechazado', tono: 'peligro' };
      case 'taller':
        if (g === 'en-reparacion') return { texto: 'Garantía · sin costo', tono: 'exito' };
        if (o.pausa || o.estado === 'esperando-refaccion') return { texto: 'En pausa', tono: 'neutro' };
        return o.estado === 'adicional' ? { texto: 'En taller · adicional por aprobar', tono: 'advertencia' } : { texto: 'En taller · Autorizado', tono: 'info' };
    }
    if (g === 'en-revision') return { texto: 'Garantía · por revisar', tono: 'peligro' };
    if (g === 'por-dictaminar') return { texto: 'Garantía · con el jefe', tono: 'advertencia' };
    if (o.sinReparacion) return { texto: 'Sin reparación · con el jefe', tono: 'neutro' };
    return o.estado === 'por-aprobar' ? { texto: 'Por aprobar', tono: 'advertencia' } : { texto: 'Por cotizar', tono: 'neutro' };
  });

  /** "Jorge Salinas · iPhone 14 · Recibido hoy 12:55 · Asignado a Carlos Ruiz" */
  protected readonly subtitulo = computed(() => {
    const o = this.orden()!;
    let contexto = '';
    if (this.modo() === 'diagnostico') contexto = `Recibido ${cuando(o.recibido)} · Asignado a ${o.tecnico.nombre}`;
    else if (this.modo() === 'devolver') contexto = `El cliente rechazó el presupuesto ${cuando(o.rechazo!)}`;
    else if (o.garantia?.decision && o.estado === 'en-garantia') contexto = `Garantía aprobada por ${o.garantia.decision.por} ${cuando(o.garantia.decision.fecha)}`;
    else if (o.garantia && o.estado === 'en-garantia') contexto = `Garantía recibida ${cuando(o.garantia.recibida)}`;
    else if (o.sinReparacion) contexto = `Sin reparación reportada ${hace(o.sinReparacion.fecha)}`;
    else if (o.estado === 'por-aprobar' && o.presupuesto) contexto = `Presupuesto enviado al cliente ${hace(o.presupuesto.enviado)}`;
    else if (this.modo() === 'espera' && o.diagnostico) contexto = `Diagnóstico enviado al jefe ${hace(o.diagnostico.fecha)}`;
    else contexto = o.presupuesto?.aprobado ? `Aprobado por el cliente ${cuando(o.presupuesto.aprobado)}` : 'Trabajo autorizado';
    return `${o.cliente.nombre} · ${o.equipo} · ${contexto}`;
  });

  /** Paso de la barra (0 Recibido … 5 Terminado). */
  protected readonly pasoActual = computed(() => {
    const o = this.orden()!;
    if (this.modo() === 'taller') return 3;
    if (this.modo() === 'devolver' || o.estado === 'por-aprobar' || (o.diagnostico && !o.garantia)) return 2;
    return 1;
  });

  protected readonly tiempo = computed(() => cronometro(this.banco.tiempo(this.orden()!.folio)));
  protected readonly corriendo = computed(() => this.banco.corriendo(this.orden()!.folio));
  protected readonly puedeIniciar = computed(() => this.modo() === 'diagnostico' || this.modo() === 'taller');
  protected readonly pausada = computed(() => !!this.orden()!.pausa || this.orden()!.estado === 'esperando-refaccion');

  /** Para "Mientras tanto, puedes trabajar en" (T3.2). */
  protected readonly otras = computed(() => this.mias().filter((o) => trabajable(o) && o.folio !== this.orden()?.folio));
  protected readonly enCursoOtra = computed(() => {
    const folio = this.banco.enCurso()[this.iniciales];
    return folio && folio !== this.orden()?.folio ? (this.servicio.ordenes().find((o) => o.folio === folio) ?? null) : null;
  });

  // ---------- Cronómetro ----------
  protected botonReloj(): void {
    if (this.corriendo()) this.modal.set('pausar');
    else if (this.enCursoOtra() && this.banco.corriendo(this.enCursoOtra()!.folio)) this.modal.set('en-curso');
    else this.arrancar();
  }

  private arrancar(): void {
    const o = this.orden()!;
    if (this.pausada()) this.servicio.reanudar(o.folio, this.nombre);
    this.banco.iniciar(this.iniciales, o.folio);
  }

  /** T3.11 · Pausa la que iba en curso e inicia esta. */
  protected cambiarOrden(): void {
    const anterior = this.enCursoOtra();
    if (anterior) this.servicio.pausar(anterior.folio, 'Atender otra orden urgente', `Para iniciar ${this.orden()!.folio}`, this.nombre);
    this.modal.set(null);
    this.arrancar();
    this.avisar(`${anterior?.folio} quedó en pausa; ${this.orden()!.folio} en curso.`);
  }

  protected irA(folio: string): void {
    this.modal.set(null);
    this.router.navigate(['/tecnico/banco-de-trabajo'], { queryParams: { folio: folio.replace('#', '') } });
  }

  // ---------- Acciones ----------
  protected enviarDiagnostico(d: DiagnosticoEnviado): void {
    const folio = this.orden()!.folio;
    this.servicio.enviarDiagnostico(folio, { ...d, por: this.nombre });
    this.banco.detener(folio);
    this.avisar(`Diagnóstico de ${folio} enviado al jefe: la orden pasa a “Por cotizar”.`);
  }

  protected pausar(p: { motivo: string; nota: string }): void {
    const folio = this.orden()!.folio;
    this.servicio.pausar(folio, p.motivo, p.nota, this.nombre);
    this.banco.detener(folio);
    this.modal.set(null);
    this.avisar(`${folio} en pausa: ${p.motivo.toLowerCase()}.`);
  }

  protected pedirInfo(p: { tipo: string; mensaje: string }): void {
    const folio = this.orden()!.folio;
    this.servicio.pausar(folio, 'Esperando respuesta del cliente', `${p.tipo}: ${p.mensaje}`, this.nombre);
    PREGUNTAS_TECNICOS.update((l) => [{ folio, tecnico: this.nombre.split(' ')[0], asunto: 'necesita un dato del cliente', detalle: `${p.tipo} · orden en pausa`, fecha: new Date().toISOString() }, ...l]);
    this.banco.detener(folio);
    this.modal.set(null);
    this.avisar(`Se avisó al jefe: le escribirá al cliente por el chat. ${folio} queda en pausa.`);
  }

  protected sinReparacion(p: { motivo: string; texto: string }): void {
    const folio = this.orden()!.folio;
    this.servicio.reportarSinReparacion(folio, p.motivo, p.texto, this.nombre);
    this.banco.detener(folio);
    this.modal.set(null);
    this.avisar(`Enviado al jefe: confirmará que ${folio} no tiene reparación.`);
  }

  protected danoAdicional(p: { texto: string; urgente: boolean; conceptos: Concepto[] }): void {
    const folio = this.orden()!.folio;
    this.servicio.reportarDanoAdicional(folio, p.texto, p.urgente, p.conceptos, this.nombre);
    this.modal.set(null);
    this.avisar('Daño reportado: el jefe lo cotiza y el cliente decide. Puedes terminar lo ya autorizado.');
  }

  protected marcarListo(p: { realizado: string; notaInterna: string }): void {
    const o = this.orden()!;
    const tiempo = duracion(this.banco.tiempo(o.folio));
    this.servicio.marcarLista(o.folio, { ...p, tiempo, por: this.nombre });
    this.banco.detener(o.folio);
    this.modal.set(null);
    this.avisar(`${o.folio} ${o.estado === 'en-garantia' ? 'garantía lista' : 'listo'}: se avisó al cliente en su portal y a caja.`);
    this.siguiente();
  }

  protected devolver(nota: string): void {
    const folio = this.orden()!.folio;
    this.servicio.devolverACaja(folio, nota, this.nombre);
    this.inventario.liberar(folio);
    this.banco.detener(folio);
    this.avisar(`${folio} devuelto a caja sin reparar; las piezas apartadas quedaron libres.`);
    this.siguiente();
  }

  protected tiempoTotal(): string {
    return duracion(this.banco.tiempo(this.orden()!.folio));
  }

  protected tiempoDe(folio: string): string {
    return cronometro(this.banco.tiempo(folio));
  }

  /** Después de terminar una orden, el banco abre la siguiente que puede trabajar. */
  private siguiente(): void {
    const proxima = this.mias().find(trabajable);
    this.router.navigate(['/tecnico/banco-de-trabajo'], { queryParams: proxima ? { folio: proxima.folio.replace('#', '') } : {} });
  }

  private avisar(texto: string): void {
    this.mensaje.set(texto);
    clearTimeout(this.ocultar);
    this.ocultar = setTimeout(() => this.mensaje.set(''), 8000);
  }
}
