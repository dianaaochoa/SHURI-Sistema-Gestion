import { Injectable, inject, signal } from '@angular/core';
import { Orden, OrdenesService, TECNICOS } from '../cajera/ordenes/ordenes.service';
import { asignadas, trabajable } from './mi-trabajo';

/** Cronómetro de una orden: lo acumulado y, si está corriendo, desde cuándo. */
export interface Cronometro {
  acumulado: number;
  /** ISO */
  desde?: string;
}

/** Tiempo del día por técnico, en minutos (sin contar el equipo en curso). */
export interface Jornada {
  trabajado: number;
  pausa: number;
}

const haceMin = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const minuscula = (t: string) => (t.charAt(0).toLowerCase() + t.slice(1)).replace(/\.$/, '');

/** Pasos del trabajo autorizado (T3.3) o del trabajo de garantía (T3.10), armados con lo que se aprobó. */
export function pasosDe(o: Orden): string[] {
  if (o.garantia && o.estado === 'en-garantia') return [`Corregir la falla de garantía: ${minuscula(o.garantia.falla)}`, 'Probar la falla reportada en todo el equipo', 'Armar y sellar'];
  const piezas = (o.presupuesto?.conceptos ?? o.diagnostico?.conceptos ?? []).filter((c) => c.tipo === 'refaccion').map((c) => `Instalar ${minuscula(c.descripcion)}`);
  return ['Desarmar y respaldar tornillería', ...(piezas.length ? piezas : [o.trabajo]), 'Limpiar conectores y puerto', 'Probar carga, pantalla, táctil y cámaras', 'Armar y sellar'];
}

/**
 * Banco de trabajo de los técnicos (T1, T2 y T3). Simulado en memoria mientras no exista la API:
 * - un cronómetro por orden y la orden que cada técnico trae en curso (solo una a la vez, T3.11);
 * - los pasos marcados del trabajo autorizado;
 * - el tiempo del día de cada técnico.
 * Arranca como Figma T1.1: cada técnico con su primer equipo trabajable en curso desde hace 45 min y 3 pasos hechos.
 */
@Injectable({ providedIn: 'root' })
export class BancoService {
  private readonly ordenes = inject(OrdenesService).ordenes;

  /** Reloj compartido para los cronómetros (avanza cada segundo). */
  readonly ahora = signal(Date.now());

  /** Orden en curso por técnico (iniciales → folio). */
  readonly enCurso = signal<Record<string, string>>({});
  readonly tiempos = signal<Record<string, Cronometro>>({});
  readonly pasos = signal<Record<string, boolean[]>>({});
  /** Figma T1.1 "Mi día": 3 h 40 min trabajadas (con los 45 min del equipo en curso) y 25 min en pausa. */
  readonly jornada = signal<Record<string, Jornada>>(Object.fromEntries(TECNICOS.map((t) => [t.iniciales, { trabajado: 175, pausa: 25 }])));

  constructor() {
    setInterval(() => this.ahora.set(Date.now()), 1000);
    const enCurso: Record<string, string> = {};
    const tiempos: Record<string, Cronometro> = {};
    const pasos: Record<string, boolean[]> = {};
    for (const t of TECNICOS) {
      const suyas = asignadas(t, this.ordenes());
      // Lo que ya tiene diagnóstico lleva tiempo de revisión (Figma T3.2: 00:42:10).
      for (const o of suyas) if (o.diagnostico) tiempos[o.folio] = { acumulado: (42 * 60 + 10) * 1000 };
      const trabajables = suyas.filter(trabajable);
      const o = trabajables.find((x) => x.estado === 'en-taller' || x.estado === 'adicional') ?? trabajables[0];
      if (!o) continue;
      enCurso[t.iniciales] = o.folio;
      tiempos[o.folio] = { acumulado: 0, desde: haceMin(45) };
      pasos[o.folio] = pasosDe(o).map((_, i) => i < 3);
    }
    this.enCurso.set(enCurso);
    this.tiempos.set(tiempos);
    this.pasos.set(pasos);
  }

  /** Milisegundos trabajados en la orden (lee el reloj, así los cronómetros avanzan solos). */
  tiempo(folio: string): number {
    const c = this.tiempos()[folio];
    if (!c) return 0;
    return c.acumulado + (c.desde ? Math.max(0, this.ahora() - new Date(c.desde).getTime()) : 0);
  }

  corriendo(folio: string): boolean {
    return !!this.tiempos()[folio]?.desde;
  }

  /** Arranca la orden; si el técnico traía otra, esa se detiene (T3.11). */
  iniciar(iniciales: string, folio: string): void {
    const anterior = this.enCurso()[iniciales];
    if (anterior && anterior !== folio) this.detener(anterior);
    this.tiempos.update((t) => ({ ...t, [folio]: { acumulado: t[folio]?.acumulado ?? 0, desde: new Date().toISOString() } }));
    this.enCurso.update((e) => ({ ...e, [iniciales]: folio }));
  }

  /** Detiene el cronómetro (pausa, diagnóstico enviado o equipo listo). La orden deja de estar en curso. */
  detener(folio: string): void {
    const c = this.tiempos()[folio];
    if (c?.desde) {
      // Lo que corrió en este tramo se suma a "Mi día" del técnico que la traía (T1.1).
      const minutos = Math.floor(this.segmento(folio) / 60_000);
      const tecnico = Object.entries(this.enCurso()).find(([, f]) => f === folio)?.[0];
      if (tecnico) this.jornada.update((j) => ({ ...j, [tecnico]: { ...j[tecnico], trabajado: (j[tecnico]?.trabajado ?? 0) + minutos } }));
      this.tiempos.update((t) => ({ ...t, [folio]: { acumulado: this.tiempo(folio) } }));
    }
    this.enCurso.update((e) => Object.fromEntries(Object.entries(e).filter(([, f]) => f !== folio)));
  }

  /** Lo que lleva corriendo desde la última vez que se inició. */
  segmento(folio: string): number {
    const desde = this.tiempos()[folio]?.desde;
    return desde ? Math.max(0, this.ahora() - new Date(desde).getTime()) : 0;
  }

  /** Pasos marcados de la orden (todos sin marcar si nunca se abrió). */
  marcados(o: Orden): boolean[] {
    const total = pasosDe(o).length;
    const guardados = this.pasos()[o.folio] ?? [];
    return Array.from({ length: total }, (_, i) => !!guardados[i]);
  }

  marcar(o: Orden, i: number, hecho: boolean): void {
    const lista = this.marcados(o);
    lista[i] = hecho;
    this.pasos.update((p) => ({ ...p, [o.folio]: lista }));
  }

  avance(o: Orden): { hechos: number; total: number } {
    const m = this.marcados(o);
    return { hechos: m.filter(Boolean).length, total: m.length };
  }
}
