import { Component, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { Orden, saldo } from '../../cajera/ordenes/ordenes.service';
import { formatearDinero } from '../../compartido/formato';
import { REGLAS_TALLER } from '../../compartido/reglas-taller';
import { PortalService } from '../portal.service';

type Fase = 'revision' | 'costo' | 'aprobada' | 'lista' | 'rechazada' | 'cerrada';

const DIA = 86_400_000;
const PASOS = ['Recibido', 'Revisión', 'Aprobación', 'Taller', 'Listo', 'Terminado', 'Garantía', 'Terminado'];
const dia = (iso: string | number) => {
  const f = new Date(iso);
  return `${f.getDate()} ${f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;
};
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });

/** Fase de la garantía según la orden (Figma P3.2–P3.5). */
export function faseGarantia(o: Orden): Fase {
  const d = o.garantia?.decision;
  const aceptada = d?.tipo === 'aplica' || (d?.tipo === 'con-costo' && d.respuesta?.acepta);
  if (o.estado === 'terminada') return 'cerrada';
  if (o.estado === 'garantia-lista') return aceptada ? 'lista' : 'rechazada';
  if (!d) return 'revision';
  if (d.tipo === 'con-costo' && !d.respuesta) return 'costo';
  return aceptada ? 'aprobada' : 'rechazada';
}

/** P3 · Seguimiento de garantía dentro del seguimiento de la orden (P2). */
@Component({
  selector: 'app-garantia-portal',
  standalone: true,
  templateUrl: './garantia-portal.component.html',
  styleUrls: ['../portal.css', '../seguimiento/seguimiento.component.css', '../seguimiento/tarjetas.css', './garantia-portal.component.css'],
})
export class GarantiaPortalComponent {
  private readonly portal = inject(PortalService);

  readonly orden = input.required<Orden>();
  readonly telefono = input.required<string>();
  readonly clausulas = output<void>();

  protected readonly pasos = PASOS;
  protected readonly confirmar = signal<'aceptar' | 'rechazar' | null>(null);
  private readonly ultimoAviso = signal<{ texto: string; estado: string } | null>(null);
  protected readonly aviso = computed(() => {
    const a = this.ultimoAviso();
    return a && a.estado === this.orden().estado + (this.orden().garantia?.decision?.respuesta ? 'r' : '') ? a.texto : '';
  });

  protected readonly v = computed(() => {
    const o = this.orden();
    const g = o.garantia!;
    const d = g.decision;
    const fase = faseGarantia(o);
    const costo = d?.tipo === 'con-costo' ? (d.costo ?? 0) : 0;
    const aceptoCosto = d?.tipo === 'con-costo' && !!d.respuesta?.acepta;
    const entregaGarantia = o.historial.find((h) => /tras garantía/i.test(h.texto))?.fecha;
    const plazo = new Date(new Date(o.listaDesde ?? Date.now()).getTime() + REGLAS_TALLER.diasSinCobro * DIA);
    const base = {
      cerrada: { badge: 'Garantía cerrada', tono: 'exito', titulo: 'Garantía terminada', paso: 9, error: false, linea: `TERMINADO · Garantía cerrada${entregaGarantia ? `, entregado el ${dia(entregaGarantia)}` : ''}` },
      lista: { badge: 'Garantía lista', tono: 'exito', titulo: 'Tu equipo está listo', paso: 8, error: false, linea: 'LISTO · Pasa a recogerlo con el mismo folio' },
      rechazada: {
        badge: 'Garantía rechazada',
        tono: 'peligro',
        titulo: d?.tipo === 'con-costo' ? 'Rechazaste el costo extra' : 'Tu garantía no aplica',
        paso: 7,
        error: true,
        linea: 'GARANTÍA · Tu equipo se devuelve sin reparar',
      },
      costo: { badge: 'Garantía · Requiere tu respuesta', tono: 'advertencia', titulo: 'Seguimiento de garantía', paso: 7, error: false, linea: 'GARANTÍA · Dictamen listo, revisa el costo extra' },
      aprobada: {
        badge: 'Garantía aprobada',
        tono: 'exito',
        titulo: 'Seguimiento de garantía',
        paso: 7,
        error: false,
        linea: aceptoCosto ? 'GARANTÍA · Costo extra aceptado, en reparación' : 'GARANTÍA · Aprobada, en reparación sin costo',
      },
      revision: { badge: 'Garantía en revisión', tono: 'info', titulo: 'Seguimiento de garantía', paso: 7, error: false, linea: 'GARANTÍA · En revisión del técnico' },
    }[fase];
    return {
      fase,
      ...base,
      sub: fase === 'cerrada' ? `Folio ${o.folio} · ${o.equipo}` : `Folio ${o.folio} · Garantía solicitada el ${dia(g.recibida)}`,
      falla: g.falla,
      enTaller: !!g.recibio || o.historial.some((h) => /recibido en garantía/i.test(h.texto)),
      dictamen: d?.texto ?? '',
      concepto: d?.concepto ?? 'Reemplazo (garantía)',
      costo: formatearDinero(costo),
      totalPagar: formatearDinero(fase === 'lista' ? saldo(o) : aceptoCosto ? costo : 0),
      aceptoCosto,
      realizado: g.resolucion || o.realizado || d?.texto || '',
      entregado: entregaGarantia ? `${dia(entregaGarantia)} · ${hora(entregaGarantia)} · SHURI` : '',
      plazo: `Tienes ${REGLAS_TALLER.diasSinCobro} días para recogerlo (hasta el ${dia(plazo.getTime())}). Después pasará a bodega y el taller no se hace responsable por su deterioro.`,
    };
  });

  protected pasoEstado(i: number): 'hecho' | 'actual' | 'error' | 'pendiente' {
    const v = this.v();
    if (i < v.paso) return 'hecho';
    if (i === v.paso) return v.error ? 'error' : 'actual';
    return 'pendiente';
  }

  protected responder(): void {
    const accion = this.confirmar();
    if (!accion) return;
    const ok = this.portal.responderGarantia(this.orden().folio, accion === 'aceptar');
    this.confirmar.set(null);
    if (ok) {
      const o = this.orden();
      this.ultimoAviso.set({
        texto: accion === 'aceptar' ? 'Aceptaste el costo extra. El técnico repara tu equipo y te avisamos cuando esté listo.' : 'Rechazaste el costo extra. Tu equipo se devuelve sin reparar.',
        estado: o.estado + 'r',
      });
    }
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.confirmar.set(null);
  }
}
