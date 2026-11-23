import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { descargar, pdfDeLineas } from '../../administrador/pdf-simple';
import { NEGOCIO } from '../../cajera/documentos/documentos.service';
import { Orden, saldo, EtapaFoto, FotoEvidencia, evidenciasDe } from '../../cajera/ordenes/ordenes.service';
import { formatearDinero } from '../../compartido/formato';
import { REGLAS_TALLER } from '../../compartido/reglas-taller';
import { InformacionModalComponent } from '../compartido/informacion-modal.component';
import { GarantiaPortalComponent } from '../garantia/garantia-portal.component';
import { SolicitarGarantiaComponent } from '../garantia/solicitar-garantia.component';
import { AvisoChatComponent } from '../chat/aviso-chat.component';
import { FotosOrdenComponent } from '../../compartido/fotos-orden/fotos-orden.component';
import { PortalService } from '../portal.service';

type Variante = 'garantia' | 'recibido' | 'revision' | 'dato' | 'presupuesto' | 'rechazado' | 'sin-reparacion' | 'taller' | 'adicional' | 'listo' | 'entregado';

const DIA = 86_400_000;
const PASOS = ['Recibido', 'Revisión', 'Aprobación', 'Taller', 'Listo', 'Terminado'];
export const GUSTOS = ['Rapidez', 'Trato', 'Precio', 'Avisos en el portal', 'Calidad'];

const dia = (iso: string | number) => {
  const f = new Date(iso);
  return `${f.getDate()} ${f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;
};
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });

/** Qué pantalla de Figma P2 corresponde al estado de la orden. */
function varianteDe(o: Orden): Variante {
  const esperaCliente = !!o.pausa && /cliente/i.test(o.pausa.motivo);
  // P3: la orden ya tiene garantía (solicitada, dictaminada, lista o cerrada).
  if (o.garantia && ['en-garantia', 'garantia-lista', 'terminada'].includes(o.estado)) return 'garantia';
  switch (o.estado) {
    case 'terminada':
    case 'sin-reparar-entregada':
      return 'entregado';
    case 'lista':
    case 'garantia-lista':
      return 'listo';
    case 'sin-reparacion':
    case 'vencida':
    case 'bodega':
      return o.rechazo ? 'rechazado' : 'sin-reparacion';
    case 'adicional':
      return 'adicional';
    case 'por-aprobar':
      return 'presupuesto';
    case 'por-cotizar':
      if (esperaCliente) return 'dato';
      // El anticipo y las fotos se registran al recibirlo: no cuentan como avance de la revisión.
      return o.diagnostico || o.historial.some((e) => !/^recibido|^anticipo|foto/i.test(e.texto)) ? 'revision' : 'recibido';
    default:
      return esperaCliente ? 'dato' : 'taller';
  }
}

const VARIANTES: Record<Variante, { badge: string; tono: string; titulo: string; paso: number; error?: boolean; linea: string }> = {
  garantia: { badge: 'Garantía', tono: 'info', titulo: 'Seguimiento de garantía', paso: 7, linea: '' },
  recibido: { badge: 'Equipo recibido', tono: 'info', titulo: 'Recibimos tu equipo', paso: 1, linea: 'RECIBIDO · En espera de revisión' },
  revision: { badge: 'En diagnóstico', tono: 'info', titulo: 'Estamos revisando tu equipo', paso: 2, linea: 'REVISIÓN · Revisión técnica en curso' },
  dato: { badge: 'Acción requerida', tono: 'advertencia', titulo: 'Necesitamos un dato tuyo', paso: 2, linea: 'REVISIÓN · En pausa, esperando tu respuesta' },
  presupuesto: { badge: 'Pendiente de autorización', tono: 'advertencia', titulo: 'Revisa tu presupuesto', paso: 3, linea: 'APROBACIÓN · Pendiente de tu decisión' },
  rechazado: { badge: 'Presupuesto rechazado', tono: 'peligro', titulo: 'Rechazaste el presupuesto', paso: 3, error: true, linea: 'RECHAZADO · Tu equipo no será reparado' },
  'sin-reparacion': { badge: 'Sin reparación', tono: 'peligro', titulo: 'Tu equipo no tiene reparación', paso: 2, error: true, linea: 'SIN REPARACIÓN · Confirmado por el taller' },
  taller: { badge: 'Presupuesto autorizado', tono: 'exito', titulo: 'Tu equipo está en reparación', paso: 4, linea: 'EN TALLER · Reparación en curso' },
  adicional: { badge: 'Cargo adicional', tono: 'advertencia', titulo: 'Hay un daño adicional', paso: 4, linea: 'EN TALLER · Esperando tu decisión sobre el adicional' },
  listo: { badge: 'Listo para entregar', tono: 'exito', titulo: 'Tu equipo está listo', paso: 5, linea: 'LISTO · Pasa a recogerlo' },
  entregado: { badge: 'Entregado', tono: 'exito', titulo: 'Reparación terminada', paso: 7, linea: 'TERMINADO' },
};

/** P2 · Seguimiento de la reparación (P2.1–P2.11): una pantalla que cambia con el estado de la orden. */
@Component({
  selector: 'app-seguimiento',
  standalone: true,
  imports: [RouterLink, InformacionModalComponent, GarantiaPortalComponent, SolicitarGarantiaComponent, AvisoChatComponent, FotosOrdenComponent],
  templateUrl: './seguimiento.component.html',
  styleUrls: ['../portal.css', './seguimiento.component.css', './tarjetas.css'],
})
export class SeguimientoComponent {
  /** Fotos del técnico que ve el cliente: diagnóstico en el presupuesto, daño adicional y cómo quedó al final. */
  protected fotosDe(...etapas: EtapaFoto[]): FotoEvidencia[] {
    const o = this.orden();
    return o ? evidenciasDe(o, ...etapas) : [];
  }
  private readonly portal = inject(PortalService);
  private readonly folio = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('folio') ?? '')), { initialValue: '' });

  protected readonly pasos = PASOS;
  protected readonly gustos = GUSTOS;
  protected readonly telefono = NEGOCIO.telefono.replace(/\s/g, '');
  protected readonly clausulas = signal(false);
  /** P3.1 · hoja para solicitar la garantía. */
  protected readonly solicitando = signal(false);
  protected readonly confirmar = signal<'aprobar' | 'rechazar' | null>(null);
  protected readonly nota = signal('');
  /** Aviso de la última acción; se oculta cuando la orden cambia de estado. */
  private readonly ultimoAviso = signal<{ texto: string; estado: string } | null>(null);
  protected readonly aviso = computed(() => {
    const a = this.ultimoAviso();
    return a && a.estado === this.orden()?.estado ? a.texto : '';
  });
  // Calificación (P2.11)
  protected readonly estrellas = signal(0);
  protected readonly gusto = signal<string[]>([]);
  protected readonly comentario = signal('');

  protected readonly orden = computed(() => this.portal.ordenDe(this.folio()) ?? null);
  /** P5 · chat con el jefe de técnicos de esta orden. */
  protected readonly chat = computed(() => `/portal/chat/${this.folio()}`);
  /** Equipo ya entregado que solo está en el historial del cliente (sin detalle). */
  protected readonly archivado = computed(() => (this.orden() ? null : (this.portal.equipos().find((e) => e.folio.replace('#', '') === this.folio()) ?? null)));
  protected readonly calificado = computed(() => this.portal.calificaciones()[this.orden()?.folio ?? '']);

  protected readonly v = computed(() => {
    const o = this.orden();
    if (!o) return null;
    const variante = varianteDe(o);
    const base = VARIANTES[variante];
    const total = o.presupuesto?.total ?? 0;
    const restante = saldo(o);
    const plazo = new Date(new Date(o.listaDesde ?? o.rechazo ?? Date.now()).getTime() + REGLAS_TALLER.diasSinCobro * DIA);
    const vigencia = o.presupuesto ? new Date(new Date(o.presupuesto.enviado).getTime() + (o.presupuesto.vigenciaDias ?? REGLAS_TALLER.vigenciaDias) * DIA) : null;
    const entrega = o.entrega?.fecha;
    const vence = entrega ? new Date(entrega).getTime() + REGLAS_TALLER.garantiaDias * DIA : 0;
    const quedan = entrega ? Math.max(0, Math.ceil((vence - Date.now()) / DIA)) : 0;
    const sinReparar = o.estado === 'sin-reparar-entregada';
    const revision = o.revision?.cobrar ? o.revision.monto : o.anticipo;
    const inicio = o.historial.find((h) => /diagn|reparación|revis/i.test(h.texto) && !/Recibido/.test(h.texto))?.fecha ?? o.historial[1]?.fecha;
    let linea = base.linea;
    if (variante === 'entregado' && entrega) linea = sinReparar ? `ENTREGADO · Sin reparar el ${dia(entrega)}` : `TERMINADO · Entregado y pagado el ${dia(entrega)}`;
    if (variante === 'taller' && o.estado === 'esperando-refaccion') linea = 'EN TALLER · Esperando refacción';
    if (variante === 'taller' && o.estado === 'en-garantia') linea = 'EN TALLER · Garantía en revisión';
    if (variante === 'dato' && o.estado !== 'por-cotizar') linea = 'EN TALLER · En pausa, esperando tu respuesta';
    return {
      variante,
      badge: { texto: sinReparar ? 'Entregado sin reparar' : base.badge, tono: sinReparar ? 'neutro' : base.tono },
      titulo: sinReparar ? 'Entregamos tu equipo' : base.titulo,
      paso: variante === 'dato' && o.estado !== 'por-cotizar' ? 4 : base.paso,
      error: !!base.error,
      linea,
      sub: `${o.cliente.nombre} · ${o.equipo}`,
      recibido: `Recibido el ${dia(o.recibido)} · ${hora(o.recibido)} en SHURI`,
      falla: o.ficha?.falla ?? o.trabajo,
      tecnico: `Técnico asignado: ${o.tecnico.nombre}${inicio ? ` · Inició ${dia(inicio)} · ${hora(inicio)}` : ''}`,
      // Lo que escribe el técnico es interno hasta que el jefe arma el presupuesto.
      diagnostico: 'Revisamos la falla que reportaste para darte un presupuesto exacto.',
      pausa: o.pausa?.detalle ?? '',
      presupuesto: o.presupuesto
        ? {
            descripcion: o.presupuesto.descripcion,
            refacciones: formatearDinero(o.presupuesto.refacciones * 1.16),
            manoObra: formatearDinero(o.presupuesto.manoObra * 1.16),
            total: formatearDinero(total),
            base: `Base ${formatearDinero(total / 1.16)} + IVA 16% ${formatearDinero(total - total / 1.16)}`,
            aprobado: o.presupuesto.aprobado ? dia(o.presupuesto.aprobado) : '',
            vigencia: vigencia ? `Vigente hasta el ${dia(vigencia.toISOString())} · Garantía ${REGLAS_TALLER.garantiaDias} días` : '',
          }
        : null,
      adicional: o.adicional
        ? {
            descripcion: o.adicional.descripcion,
            monto: formatearDinero(o.adicional.monto),
            montoNumero: o.adicional.monto,
            base: `Base ${formatearDinero(o.adicional.monto / 1.16)} + IVA 16% ${formatearDinero(o.adicional.monto - o.adicional.monto / 1.16)}`,
            autorizado: formatearDinero(total),
            nuevo: formatearDinero(total + o.adicional.monto),
          }
        : null,
      anticipo: formatearDinero(o.anticipo),
      restante: formatearDinero(restante),
      revision: formatearDinero(revision),
      saldoRevision: formatearDinero(Math.max(0, revision - o.anticipo)),
      motivo: o.sinReparacion?.texto ?? (o.trabajo.startsWith('Sin reparación') ? '' : o.trabajo),
      plazo: `Tienes ${REGLAS_TALLER.diasSinCobro} días para recogerlo (hasta el ${dia(plazo.toISOString())}). Después pasará a bodega y el taller no se hace responsable por su deterioro.`,
      bodega: o.estado === 'bodega' || o.estado === 'vencida',
      // Solo texto para el cliente: el historial interno del taller (notas, quién hizo qué) no se muestra.
      actualizacion: `Actualización: ${o.estado === 'esperando-refaccion' ? 'esperando una refacción' : 'reparación en curso'}${o.prometida ? ` · entrega estimada ${dia(o.prometida)}` : ''}`,
      entrega: entrega ? `${dia(entrega)} · ${hora(entrega)} · SHURI` : '',
      pagado: formatearDinero(o.entrega?.pagado ?? total),
      realizado: o.realizado ?? o.trabajo,
      garantia: { quedan, vence: vence ? dia(vence) : '', porcentaje: Math.round((quedan / REGLAS_TALLER.garantiaDias) * 100), dias: REGLAS_TALLER.garantiaDias, activa: !sinReparar && quedan > 0 },
    };
  });

  protected pasoEstado(i: number): 'hecho' | 'actual' | 'error' | 'pendiente' {
    const v = this.v();
    if (!v) return 'pendiente';
    if (i < v.paso) return 'hecho';
    if (i === v.paso) return v.error ? 'error' : 'actual';
    return 'pendiente';
  }

  protected responder(): void {
    const accion = this.confirmar();
    const o = this.orden();
    if (!accion || !o) return;
    const esAdicional = o.estado === 'adicional';
    this.portal.responder(o.folio, accion === 'aprobar', this.nota()).subscribe((r) => {
      this.confirmar.set(null);
      this.nota.set('');
      if (!r.ok) {
        this.error.set(r.mensaje);
        return;
      }
      this.error.set('');
      this.avisar(
        accion === 'aprobar'
          ? esAdicional
            ? 'Aprobaste el cargo adicional. El técnico sigue con la reparación.'
            : 'Aprobaste el presupuesto. El técnico empieza la reparación y te avisaremos cuando esté listo.'
          : esAdicional
            ? 'Rechazaste el adicional. Se termina solo lo que ya habías autorizado.'
            : 'Rechazaste el presupuesto. Tu equipo se devuelve sin reparar.',
      );
    });
  }

  /** Error de la API al responder o calificar. */
  protected readonly error = signal('');

  protected alternarGusto(g: string): void {
    this.gusto.update((l) => (l.includes(g) ? l.filter((x) => x !== g) : [...l, g]));
  }

  protected calificar(): void {
    const o = this.orden();
    if (!o || !this.estrellas()) return;
    this.portal.calificar(o.folio, this.estrellas(), this.gusto(), this.comentario()).subscribe((r) => {
      this.error.set(r.ok ? '' : r.mensaje);
      if (r.ok) this.avisar('¡Gracias por tu calificación!');
    });
  }

  protected comprobante(): void {
    const o = this.orden();
    const v = this.v();
    if (!o || !v) return;
    const lineas = [
      `${NEGOCIO.nombre} · Comprobante de entrega`,
      NEGOCIO.direccionLarga,
      '',
      `Folio: ${o.folio}`,
      `Cliente: ${o.cliente.nombre}`,
      `Equipo: ${o.equipo}`,
      `Entregado: ${v.entrega}`,
      `Total pagado: ${v.pagado}`,
      `Trabajo: ${v.realizado}`,
      v.garantia.activa ? `Garantía de ${v.garantia.dias} días: vence el ${v.garantia.vence}` : '',
    ].filter((l) => l !== undefined);
    descargar(`comprobante-${o.folio.replace('#', '')}.pdf`, pdfDeLineas(lineas, 11));
  }

  private avisar(texto: string): void {
    this.ultimoAviso.set({ texto, estado: this.orden()?.estado ?? '' });
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.confirmar.set(null);
  }
}
