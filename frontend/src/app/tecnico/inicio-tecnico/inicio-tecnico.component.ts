import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { saludoDelDia } from '../../compartido/formato';
import { Orden, OrdenesService } from '../../cajera/ordenes/ordenes.service';
import { etapaGarantia } from '../../jefe/garantias/garantia';
import { etapaDe } from '../../jefe/etapas';
import { RefaccionesService } from '../../jefe/refacciones/refacciones.service';
import { BancoService } from '../banco.service';
import { TURNO, asignadas, cronometro, enCola, hace, tecnicoDe } from '../mi-trabajo';

interface Aviso {
  icono: string;
  titulo: string;
  detalle: string;
  fecha: string;
  folio?: string;
}

const esHoy = (iso?: string) => !!iso && new Date(iso).toDateString() === new Date().toDateString();
const sinGato = (folio: string) => folio.replace('#', '');

/** 220 → "3 h 40 min" */
function minutos(min: number): string {
  const h = Math.floor(min / 60);
  return h ? `${h} h ${min % 60} min` : `${min} min`;
}

/** T1.1 · Inicio del técnico (T1.2 notificaciones y T1.3 menú de usuario están en el menú lateral). */
@Component({
  selector: 'app-inicio-tecnico',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './inicio-tecnico.component.html',
  styleUrls: ['../../jefe/inicio-jefe/inicio-jefe.component.css', './inicio-tecnico.component.css'],
})
export class InicioTecnicoComponent {
  private readonly ordenes = inject(OrdenesService).ordenes;
  private readonly refacciones = inject(RefaccionesService);
  private readonly banco = inject(BancoService);
  private readonly sesion = inject(AuthService).sesion();
  private readonly tecnico = tecnicoDe(this.sesion?.nombre);

  protected readonly saludo = `${saludoDelDia(new Date())}, ${(this.sesion?.nombre ?? '').split(' ')[0]}`;
  /** "Viernes 16 de octubre · Taller · Turno 9:00–18:00" */
  protected readonly subtitulo = (() => {
    const hoy = new Date();
    const dia = hoy.toLocaleDateString('es-MX', { weekday: 'long' });
    return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${hoy.getDate()} de ${hoy.toLocaleDateString('es-MX', { month: 'long' })} · Taller · Turno ${TURNO}`;
  })();

  private readonly mias = computed(() => asignadas(this.tecnico, this.ordenes()));

  protected readonly indicadores = computed(() => {
    const mias = this.mias();
    const enTaller = mias.filter((o) => etapaDe(o) === 'en-taller' && o.estado !== 'en-garantia');
    const pausadas = enTaller.filter((o) => o.estado === 'esperando-refaccion').length;
    const garantias = mias.filter((o) => o.estado === 'en-garantia');
    const contar = (etapa: string) => garantias.filter((o) => etapaGarantia(o) === etapa).length;
    const detalleGarantia = [
      contar('en-revision') && `${contar('en-revision')} por revisar`,
      contar('por-dictaminar') && `${contar('por-dictaminar')} con el jefe`,
      contar('en-reparacion') && `${contar('en-reparacion')} en taller`,
    ].filter(Boolean);
    return [
      { valor: mias.length, tono: '', titulo: 'Equipos asignados', detalle: 'En tu tablero' },
      { valor: mias.filter((o) => etapaDe(o) === 'por-cotizar').length, tono: 'primario', titulo: 'Por cotizar', detalle: 'Esperando al jefe' },
      { valor: mias.filter((o) => etapaDe(o) === 'por-aprobar').length, tono: 'advertencia', titulo: 'Por aprobar', detalle: 'Esperando al cliente' },
      { valor: enTaller.length, tono: 'exito', titulo: 'En taller', detalle: pausadas ? `${pausadas} en pausa por refacción` : 'Ninguno en pausa' },
      { valor: garantias.length, tono: 'peligro', titulo: 'Garantías', detalle: detalleGarantia.join(' · ') || 'Sin garantías' },
    ];
  });

  /** El equipo que tiene en su banco (T3) con su avance y el cronómetro. */
  protected readonly enCurso = computed(() => {
    const folio = this.tecnico && this.banco.enCurso()[this.tecnico.iniciales];
    const orden = folio && this.ordenes().find((o) => o.folio === folio);
    if (!orden) return null;
    const { hechos, total } = this.banco.avance(orden);
    return { orden, detalle: `${orden.trabajo} · ${hechos} de ${total} pasos · ${cronometro(this.banco.tiempo(orden.folio))}`, folio: sinGato(orden.folio) };
  });

  /** "Siguientes en tu cola (por fecha de entrega prometida)": las que no tienen fecha van al final, por antigüedad. */
  protected readonly cola = computed(() => {
    const actual = this.enCurso()?.orden.folio;
    const clave = (o: Orden) => o.prometida ?? `9${o.recibido}`;
    return this.mias()
      .filter((o) => o.folio !== actual)
      .sort((a, b) => clave(a).localeCompare(clave(b)))
      .map((o) => ({ o, folio: sinGato(o.folio), ...enCola(o) }));
  });

  /** Lo nuevo para el técnico: piezas entregadas, aprobaciones, dictámenes y equipos asignados (lo más reciente primero). */
  protected readonly avisos = computed<Aviso[]>(() => {
    const nombre = this.tecnico?.nombre ?? '';
    const avisos: Aviso[] = [];
    for (const h of this.refacciones.historial()) {
      if (!h.texto.endsWith(`entregada a ${nombre}`)) continue;
      avisos.push({ icono: 'menu/package', titulo: 'Refacción entregada', detalle: h.texto.split(' · ')[0], fecha: h.fecha, folio: h.texto.match(/#\d+/)?.[0] });
    }
    for (const s of this.refacciones.solicitudes()) {
      if (s.tecnico === nombre && s.estado === 'rechazada') avisos.push({ icono: 'menu/package', titulo: `Jefe rechazó ${s.id}`, detalle: `${s.nombre} para ${s.orden}`, fecha: s.fecha, folio: s.orden });
    }
    for (const o of this.mias()) {
      const equipo = o.equipo;
      if (o.estado === 'en-taller' && o.presupuesto?.aprobado)
        avisos.push({ icono: 'iconos/circle-check-sm', titulo: `Cliente aprobó ${o.folio}`, detalle: `${equipo} · ${hace(o.presupuesto.aprobado)} · ya puedes repararlo`, fecha: o.presupuesto.aprobado, folio: o.folio });
      const g = etapaGarantia(o);
      if (g === 'en-revision') avisos.push({ icono: 'menu/shield', titulo: `Jefe pidió revisar ${o.folio}`, detalle: `Garantía · ${equipo} · ${hace(o.garantia!.recibida)}`, fecha: o.garantia!.recibida, folio: o.folio });
      if (g === 'en-reparacion' && o.garantia!.decision)
        avisos.push({ icono: 'menu/shield', titulo: `Jefe dictaminó ${o.folio}`, detalle: `Garantía · ${o.garantia!.decision.texto}`, fecha: o.garantia!.decision.fecha, folio: o.folio });
      if (etapaDe(o) === 'diagnostico' && esHoy(o.recibido))
        avisos.push({ icono: 'menu/clip-plus', titulo: `Te asignaron ${o.folio}`, detalle: `${equipo} · ${o.trabajo}`, fecha: o.recibido, folio: o.folio });
    }
    return avisos.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 3);
  });

  /** "Mi día" */
  protected readonly miDia = computed(() => {
    const t = this.tecnico;
    const jornada = (t && this.banco.jornada()[t.iniciales]) || { trabajado: 0, pausa: 0 };
    const folio = t && this.banco.enCurso()[t.iniciales];
    const enCurso = folio ? Math.floor(this.banco.segmento(folio) / 60_000) : 0;
    const terminados = this.ordenes().filter((o) => o.tecnico.iniciales === t?.iniciales && esHoy(o.listaDesde)).length;
    const piezas = this.refacciones.solicitudes().filter((s) => s.tecnico === t?.nombre && s.estado === 'pendiente').length;
    return [
      { texto: 'Equipos terminados hoy', valor: `${terminados}` },
      { texto: 'Tiempo trabajado', valor: minutos(jornada.trabajado + enCurso) },
      { texto: 'En pausa', valor: minutos(jornada.pausa) },
      { texto: 'Refacciones pendientes', valor: `${piezas}` },
    ];
  });

  protected consulta(folio?: string): Record<string, string> | null {
    return folio ? { folio: sinGato(folio) } : null;
  }
}
