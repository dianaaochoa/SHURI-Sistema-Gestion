import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Orden, OrdenesService, ResultadoOrden, TECNICOS } from '../cajera/ordenes/ordenes.service';
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

/** Clave del cronómetro de la garantía de una orden. */
export const claveGarantia = (folio: string) => `${folio}·garantia`;

const haceMin = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const minuscula = (t: string) => (t.charAt(0).toLowerCase() + t.slice(1)).replace(/\.$/, '');

/** Pasos del trabajo autorizado (T3.3) o del trabajo de garantía (T3.10), armados con lo que se aprobó. */
export function pasosDe(o: Orden): string[] {
  if (o.garantia && o.estado === 'en-garantia') return [`Corregir la falla de garantía: ${minuscula(o.garantia.falla)}`, 'Probar la falla reportada en todo el equipo', 'Armar y sellar'];
  const piezas = (o.presupuesto?.conceptos ?? o.diagnostico?.conceptos ?? []).filter((c) => c.tipo === 'refaccion').map((c) => `Instalar ${minuscula(c.descripcion)}`);
  return ['Desarmar y respaldar tornillería', ...(piezas.length ? piezas : [o.trabajo]), 'Limpiar conectores y puerto', 'Probar carga, pantalla, táctil y cámaras', 'Armar y sellar'];
}

/**
 * Banco de trabajo de los técnicos (T1, T2 y T3).
 * - Con la API, el cronómetro de cada orden y la que el técnico trae en curso salen del servidor
 *   (order_time_logs): "Iniciar" → POST /my/orders/{folio}/start; pausar, diagnosticar o terminar
 *   lo detienen allá.
 * - Con datos de prueba, todo se simula en memoria (arranca como Figma T1.1).
 * Los pasos marcados del trabajo autorizado y "Mi día" siguen en el navegador.
 */
@Injectable({ providedIn: 'root' })
export class BancoService {
  private readonly servicio = inject(OrdenesService);
  private readonly ordenes = this.servicio.ordenes;

  /** Reloj compartido para los cronómetros (avanza cada segundo). */
  readonly ahora = signal(Date.now());

  /** Orden en curso por técnico con datos de prueba (iniciales → folio). */
  private readonly enCursoLocal = signal<Record<string, string>>({});
  /** Orden en curso por técnico (iniciales → folio): la que tiene el cronómetro corriendo en el servidor. */
  readonly enCurso = computed<Record<string, string>>(() => {
    if (!this.servicio.conApi()) return this.enCursoLocal();
    // Con la API: la del servidor y, si trae una garantía en curso (se mide en el navegador), esa
    const enGarantia = new Set(this.ordenes().filter((o) => o.estado === 'en-garantia').map((o) => o.folio));
    const locales = Object.entries(this.enCursoLocal()).filter(([, f]) => enGarantia.has(f));
    const servidor = this.ordenes().filter((o) => o.cronometro?.corriendo).map((o) => [o.tecnico.iniciales, o.folio]);
    return Object.fromEntries([...locales, ...servidor]);
  });
  readonly tiempos = signal<Record<string, Cronometro>>({});
  readonly pasos = signal<Record<string, boolean[]>>({});
  /** Figma T1.1 "Mi día": 3 h 40 min trabajadas (con los 45 min del equipo en curso) y 25 min en pausa. */
  readonly jornada = signal<Record<string, Jornada>>(Object.fromEntries(TECNICOS.map((t) => [t.iniciales, { trabajado: 175, pausa: 25 }])));

  constructor() {
    setInterval(() => this.ahora.set(Date.now()), 1000);
    const enCurso: Record<string, string> = {};
    const tiempos: Record<string, Cronometro> = {};
    const pasos: Record<string, boolean[]> = {};
    // Equipos que ya terminaron antes del banco (T6 "Tiempo"): de 40 a 89 min según el folio, solo como dato de prueba.
    for (const o of this.ordenes()) {
      if (o.listaDesde) tiempos[o.folio] = { acumulado: (40 + ((Number(o.folio.replace(/\D/g, '')) * 7) % 50)) * 60_000 };
    }
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
    this.enCursoLocal.set(enCurso);
    this.tiempos.set(tiempos);
    this.pasos.set(pasos);
  }

  private cronometroApi(folio: string) {
    return this.servicio.conApi() ? this.ordenes().find((o) => o.folio === folio)?.cronometro : undefined;
  }

  /**
   * El cronómetro lo lleva el servidor, salvo en una garantía: la orden ya está entregada en la API
   * y su revisión o reparación se mide en el navegador (por separado de la reparación original).
   */
  private usaApi(folio: string): boolean {
    return this.servicio.conApi() && this.ordenes().find((o) => o.folio === folio)?.estado !== 'en-garantia';
  }

  /**
   * Clave del cronómetro y de los pasos: mientras la orden está en garantía se mide aparte (`#1024·garantia`),
   * así el tiempo de la reparación original no cambia y el de la garantía se ve por separado.
   */
  private clave(folio: string): string {
    return this.ordenes().find((o) => o.folio === folio)?.estado === 'en-garantia' ? claveGarantia(folio) : folio;
  }

  /** Milisegundos trabajados en la orden (lee el reloj, así los cronómetros avanzan solos). */
  tiempo(folio: string): number {
    if (this.usaApi(folio)) {
      const api = this.cronometroApi(folio);
      if (!api) return 0;
      return api.minutos * 60_000 + (api.corriendo && api.desde ? Math.max(0, this.ahora() - new Date(api.desde).getTime()) : 0);
    }
    return this.medir(this.clave(folio));
  }

  /** Tiempo de la reparación original, aunque la orden esté en garantía (con la API, el total del servidor). */
  tiempoReparacion(folio: string): number {
    if (!this.servicio.conApi()) return this.medir(folio);
    const api = this.cronometroApi(folio);
    return api ? api.minutos * 60_000 : 0;
  }

  /** Tiempo trabajado en la garantía (0 si no ha tenido); se mide en el navegador. */
  tiempoGarantia(folio: string): number {
    return this.medir(claveGarantia(folio));
  }

  private medir(clave: string): number {
    const c = this.tiempos()[clave];
    if (!c) return 0;
    return c.acumulado + (c.desde ? Math.max(0, this.ahora() - new Date(c.desde).getTime()) : 0);
  }

  corriendo(folio: string): boolean {
    if (this.usaApi(folio)) return !!this.cronometroApi(folio)?.corriendo;
    return !!this.tiempos()[this.clave(folio)]?.desde;
  }

  /**
   * Arranca la orden; si el técnico traía otra, esa se detiene (T3.11).
   * Con la API, el servidor arranca el cronómetro (y rechaza si ya corre otra orden).
   */
  iniciar(iniciales: string, folio: string): Observable<ResultadoOrden> {
    if (this.usaApi(folio)) return this.servicio.iniciarTrabajo(folio);
    const anterior = this.enCurso()[iniciales];
    if (anterior && anterior !== folio && !this.usaApi(anterior)) this.detener(anterior);
    const clave = this.clave(folio);
    this.tiempos.update((t) => ({ ...t, [clave]: { acumulado: t[clave]?.acumulado ?? 0, desde: new Date().toISOString() } }));
    this.enCursoLocal.update((e) => ({ ...e, [iniciales]: folio }));
    return of({ ok: true, mensaje: '' });
  }

  /**
   * Detiene el cronómetro (pausa, diagnóstico enviado o equipo listo). La orden deja de estar en curso.
   * Con la API no hace nada: cada una de esas acciones ya lo detiene en el servidor.
   */
  detener(folio: string): void {
    if (this.usaApi(folio)) return;
    const clave = this.clave(folio);
    const c = this.tiempos()[clave];
    if (c?.desde) {
      // Lo que corrió en este tramo se suma a "Mi día" del técnico que la traía (T1.1).
      const minutos = Math.floor(this.segmento(folio) / 60_000);
      const tecnico = Object.entries(this.enCurso()).find(([, f]) => f === folio)?.[0];
      if (tecnico) this.jornada.update((j) => ({ ...j, [tecnico]: { ...j[tecnico], trabajado: (j[tecnico]?.trabajado ?? 0) + minutos } }));
      this.tiempos.update((t) => ({ ...t, [clave]: { acumulado: this.medir(clave) } }));
    }
    this.enCursoLocal.update((e) => Object.fromEntries(Object.entries(e).filter(([, f]) => f !== folio)));
  }

  /** Lo que lleva corriendo desde la última vez que se inició. */
  segmento(folio: string): number {
    const desde = this.usaApi(folio) ? (this.cronometroApi(folio)?.corriendo ? this.cronometroApi(folio)?.desde : undefined) : this.tiempos()[this.clave(folio)]?.desde;
    return desde ? Math.max(0, this.ahora() - new Date(desde).getTime()) : 0;
  }

  /** Pasos marcados de la orden (todos sin marcar si nunca se abrió). */
  marcados(o: Orden): boolean[] {
    const total = pasosDe(o).length;
    const guardados = this.pasos()[this.clave(o.folio)] ?? [];
    return Array.from({ length: total }, (_, i) => !!guardados[i]);
  }

  marcar(o: Orden, i: number, hecho: boolean): void {
    const lista = this.marcados(o);
    lista[i] = hecho;
    this.pasos.update((p) => ({ ...p, [this.clave(o.folio)]: lista }));
  }

  avance(o: Orden): { hechos: number; total: number } {
    const m = this.marcados(o);
    return { hechos: m.filter(Boolean).length, total: m.length };
  }
}
