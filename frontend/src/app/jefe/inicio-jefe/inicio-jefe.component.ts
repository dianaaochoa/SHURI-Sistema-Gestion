import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { saludoDelDia } from '../../compartido/formato';
import { EstadoOrden, OrdenesService, POR_ASIGNAR, TECNICOS } from '../../cajera/ordenes/ordenes.service';
import { etapaGarantia, recomendacion } from '../garantias/garantia';
import { SLA_DIAGNOSTICO_H, atrasada, etapaDe, horasDesde } from '../etapas';
import { MENSAJES_SIN_RESPONDER, PREGUNTAS_TECNICOS } from '../jefe.datos';
import { RefaccionesService } from '../refacciones/refacciones.service';

/** En el taller: recibidas y no entregadas (sin contar las vencidas ni las de bodega). */
const EN_TALLER: EstadoOrden[] = ['por-cotizar', 'por-aprobar', 'adicional', 'en-taller', 'esperando-refaccion', 'en-garantia', 'lista', 'garantia-lista', 'sin-reparacion'];

type Tono = 'info' | 'peligro' | 'advertencia' | 'neutro';

interface Pendiente {
  icono: string;
  tono: Tono;
  titulo: string;
  detalle: string;
  accion: string;
  ruta: string;
  folio?: string;
}

/** "hace 3 min", "hace 2 h", "hace 2 días" */
function hace(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} ${Math.floor(h / 24) === 1 ? 'día' : 'días'}`;
}

const esHoy = (iso?: string) => !!iso && new Date(iso).toDateString() === new Date().toDateString();

/** J1.1 · Inicio del jefe de técnicos (J1.2 notificaciones y J1.3 menú de usuario están en el menú lateral). */
@Component({
  selector: 'app-inicio-jefe',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './inicio-jefe.component.html',
  styleUrl: './inicio-jefe.component.css',
})
export class InicioJefeComponent {
  private readonly ordenes = inject(OrdenesService).ordenes;
  private readonly refacciones = inject(RefaccionesService);
  private readonly nombre = (inject(AuthService).sesion()?.nombre ?? '').split(' ')[0];

  protected readonly saludo = `${saludoDelDia(new Date())}, ${this.nombre}`;
  /** "Viernes 16 de octubre · Taller SHURI · 3 técnicos en turno" */
  protected readonly subtitulo = (() => {
    const hoy = new Date();
    const dia = hoy.toLocaleDateString('es-MX', { weekday: 'long' });
    const mes = hoy.toLocaleDateString('es-MX', { month: 'long' });
    return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${hoy.getDate()} de ${mes} · Taller SHURI · ${TECNICOS.length} técnicos en turno`;
  })();

  private readonly enTaller = computed(() => this.ordenes().filter((o) => EN_TALLER.includes(o.estado)));
  /** Con diagnóstico, esperando que el jefe cotice (columna "Por cotizar" de J2). */
  private readonly porCotizar = computed(() => this.ordenes().filter((o) => etapaDe(o) === 'por-cotizar'));
  /** Más de 24 h sin cotizar (recibidas, en diagnóstico o por cotizar). */
  private readonly atrasadas = computed(() => this.ordenes().filter((o) => o.tecnico !== POR_ASIGNAR && atrasada(o)));
  private readonly garantias = computed(() => this.ordenes().filter((o) => etapaGarantia(o) === 'por-dictaminar'));
  private readonly sinTecnico = computed(() => this.ordenes().filter((o) => o.tecnico === POR_ASIGNAR && EN_TALLER.includes(o.estado)));

  protected readonly indicadores = computed(() => [
    { valor: this.enTaller().length, tono: '', titulo: 'Órdenes abiertas', detalle: 'En el taller', ruta: 'tablero-de-ordenes' },
    { valor: this.porCotizar().length, tono: 'peligro', titulo: 'Por cotizar', detalle: this.atrasadas().length ? `${this.atrasadas().length} fuera de tiempo` : 'Todas a tiempo', ruta: 'por-cotizar' },
    { valor: this.garantias().length, tono: 'advertencia', titulo: 'Garantías', detalle: 'Esperan tu dictamen', ruta: 'garantias' },
    { valor: this.refacciones.pendientes().length, tono: 'primario', titulo: 'Refacciones', detalle: 'Solicitudes pendientes', ruta: 'refacciones' },
    { valor: this.ordenes().filter((o) => o.estado === 'lista' || o.estado === 'garantia-lista').length, tono: 'exito', titulo: 'Listos', detalle: 'Para entregar', ruta: 'equipos-terminados' },
  ]);

  /** "Requiere tu atención": lo más urgente primero, como en Figma J1.1. */
  protected readonly pendientes = computed<Pendiente[]>(() => [
    ...MENSAJES_SIN_RESPONDER.map((m) => ({
      icono: 'menu/msg', tono: 'info' as Tono, titulo: `${m.folio} · ${m.cliente} te escribió`,
      detalle: `“${m.texto}” · ${m.equipo} · ${hace(m.fecha)}`, accion: 'Responder', ruta: 'mensajes',
    })),
    ...PREGUNTAS_TECNICOS.map((p) => ({
      icono: 'menu/wrench', tono: 'info' as Tono, titulo: `${p.folio} · ${p.tecnico} ${p.asunto}`,
      detalle: `${p.detalle} · ${hace(p.fecha)}`, accion: 'Escribir', ruta: 'mensajes',
    })),
    ...this.porCotizar()
      .filter((o) => !atrasada(o))
      .map((o) => ({
        icono: 'menu/receipt', tono: 'info' as Tono, titulo: `${o.folio} · ${o.equipo} · Por cotizar`,
        detalle: `${o.tecnico.nombre.split(' ')[0]} envió diagnóstico ${hace(o.diagnostico!.fecha)} · ${minuscula(o.diagnostico!.resumen ?? o.diagnostico!.texto)}`, accion: 'Cotizar', ruta: 'por-cotizar', folio: o.folio,
      })),
    ...this.atrasadas().map((o) => ({
      icono: 'cajera/clock', tono: 'peligro' as Tono, titulo: `${o.folio} · ${o.equipo} · ${o.diagnostico ? 'Por cotizar' : 'En diagnóstico'}`,
      detalle: `Fuera de tiempo: ${Math.floor(horasDesde(o.recibido))} h de ${SLA_DIAGNOSTICO_H} h de SLA`, accion: 'Atrasada', ruta: o.diagnostico ? 'por-cotizar' : 'tablero-de-ordenes', folio: o.folio,
    })),
    ...this.ordenes()
      .filter((o) => o.sinReparacion)
      .map((o) => ({
        icono: 'cajera/alert', tono: 'peligro' as Tono, titulo: `${o.folio} · ${o.equipo} · Sin reparación`,
        detalle: `${o.tecnico.nombre.split(' ')[0]} reportó: ${minuscula(o.sinReparacion!.motivo)} · ${hace(o.sinReparacion!.fecha)}`, accion: 'Confirmar', ruta: 'por-cotizar', folio: o.folio,
      })),
    ...this.ordenes()
      .filter((o) => o.danoAdicional)
      .map((o) => ({
        icono: 'menu/wrench', tono: 'advertencia' as Tono, titulo: `${o.folio} · ${o.equipo} · Daño adicional`,
        detalle: `${o.tecnico.nombre.split(' ')[0]}: ${minuscula(o.danoAdicional!.texto)} · ${hace(o.danoAdicional!.fecha)}`, accion: 'Re-cotizar', ruta: 'por-cotizar', folio: o.folio,
      })),
    ...this.garantias().map((o) => ({
      icono: 'menu/shield', tono: 'advertencia' as Tono, titulo: `${o.folio} · ${o.equipo} · Garantía`,
      detalle: `${o.tecnico.nombre.split(' ')[0]} recomienda: ${minuscula(recomendacion(o)?.texto ?? '')} · ${hace(o.garantia!.reporte!.fecha)}`, accion: 'Dictaminar', ruta: 'garantias', folio: o.folio,
    })),
    ...this.sinTecnico().map((o) => ({
      icono: 'menu/users', tono: 'neutro' as Tono, titulo: `${o.folio} · ${o.equipo} · Recibido`,
      detalle: `Sin técnico asignado desde ${hace(o.recibido)}`, accion: 'Asignar', ruta: 'tablero-de-ordenes', folio: o.folio,
    })),
    // La primera pieza sin stock que pidió un técnico (Figma J1.1 "Pedir").
    ...this.refacciones
      .pendientes()
      .filter((s) => !s.siAprueba && this.refacciones.enStock(s) < s.cantidad)
      .slice(0, 1)
      .map((s) => ({
        icono: 'menu/package', tono: 'advertencia' as Tono, titulo: `${s.orden} · ${s.nombre} · Refacción`,
        detalle: `${s.tecnico.split(' ')[0]} la pidió (${s.id}) · sin stock · ${hace(s.fecha)}`, accion: 'Pedir', ruta: 'refacciones', folio: s.orden,
      })),
  ]);

  /** Carga por técnico: órdenes en el taller de cada uno, la que trae en curso o en pausa. */
  protected readonly carga = computed(() =>
    TECNICOS.map((t) => {
      const suyas = this.enTaller().filter((o) => o.tecnico.iniciales === t.iniciales);
      const enCurso = suyas.find((o) => ['en-taller', 'adicional', 'en-garantia', 'por-cotizar'].includes(o.estado));
      const enPausa = !enCurso ? suyas.find((o) => o.estado === 'esperando-refaccion') : undefined;
      const estado = suyas.length >= 5 ? { texto: 'Ocupado', tono: 'advertencia' } : enPausa ? { texto: 'En pausa', tono: 'neutro' } : { texto: 'Disponible', tono: 'exito' };
      const detalle = [`${suyas.length} ${suyas.length === 1 ? 'orden' : 'órdenes'}`, enCurso ? `en curso ${enCurso.folio}` : enPausa ? `en pausa ${enPausa.folio}` : 'sin orden en curso'].join(' · ');
      return { ...t, detalle, estado, avance: Math.min(100, (suyas.length / 6) * 100) };
    }),
  );

  /** "Hoy en el taller" */
  protected readonly hoy = computed(() => {
    const o = this.ordenes();
    const conPresupuesto = o.filter((x) => x.presupuesto);
    const enviadosHoy = conPresupuesto.filter((x) => esHoy(x.presupuesto!.enviado));
    const promedioMin = conPresupuesto.length
      ? conPresupuesto.reduce((s, x) => s + (new Date(x.presupuesto!.enviado).getTime() - new Date(x.recibido).getTime()) / 60_000, 0) / conPresupuesto.length
      : 0;
    const bodegaVieja = o.filter((x) => x.estado === 'bodega' && x.bodega && horasDesde(x.bodega.enviado) > 30 * 24).length;
    return [
      { texto: 'Equipos terminados', valor: `${o.filter((x) => esHoy(x.listaDesde)).length}` },
      { texto: 'Presupuestos enviados', valor: `${enviadosHoy.length} · ${enviadosHoy.filter((x) => esHoy(x.presupuesto!.aprobado)).length} aprobados` },
      { texto: 'Tiempo promedio de diagnóstico', valor: duracion(promedioMin) },
      { texto: 'En bodega más de 30 días', valor: `${bodegaVieja} ${bodegaVieja === 1 ? 'equipo' : 'equipos'}` },
    ];
  });

  protected rutaDe(p: Pendiente): unknown[] {
    return ['/jefe', p.ruta];
  }

  protected consulta(p: Pendiente): Record<string, string> | null {
    return p.folio ? { folio: p.folio.replace('#', '') } : null;
  }
}

/** 320 min → "5 h 20 min"; más de un día → "1 d 4 h". */
function duracion(min: number): string {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h`;
  return h ? `${h} h ${Math.round(min % 60)} min` : `${Math.round(min)} min`;
}

const minuscula = (texto: string) => texto.charAt(0).toLowerCase() + texto.slice(1);
