import { Injectable, inject, signal } from '@angular/core';
import { OrdenesService, TECNICOS } from '../cajera/ordenes/ordenes.service';
import { asignadas, trabajable } from './mi-trabajo';

/** Lo que el técnico trae en su banco de trabajo (T3): orden, desde cuándo y en qué paso va. */
export interface TrabajoEnCurso {
  folio: string;
  /** ISO: cuándo empezó (el cronómetro de T1.1 y T3). */
  desde: string;
  paso: number;
  pasos: number;
}

/** Tiempo del día por técnico, en minutos (sin contar lo que lleva el trabajo en curso). */
export interface Jornada {
  trabajado: number;
  pausa: number;
}

const haceMin = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

/**
 * Banco de trabajo de cada técnico, por iniciales. Simulado en memoria mientras no exista la API:
 * cada uno arranca con su primer equipo trabajable en curso desde hace 45 min, en el paso 3 de 6 (Figma T1.1).
 */
@Injectable({ providedIn: 'root' })
export class BancoService {
  private readonly ordenes = inject(OrdenesService).ordenes;

  readonly enCurso = signal<Record<string, TrabajoEnCurso>>(this.inicial());

  /** Figma T1.1 "Mi día": 3 h 40 min trabajadas (con los 45 min del equipo en curso) y 25 min en pausa. */
  readonly jornada = signal<Record<string, Jornada>>(Object.fromEntries(TECNICOS.map((t) => [t.iniciales, { trabajado: 175, pausa: 25 }])));

  private inicial(): Record<string, TrabajoEnCurso> {
    const banco: Record<string, TrabajoEnCurso> = {};
    for (const t of TECNICOS) {
      const suyas = asignadas(t, this.ordenes()).filter(trabajable);
      const o = suyas.find((x) => x.estado === 'en-taller' || x.estado === 'adicional') ?? suyas[0];
      if (o) banco[t.iniciales] = { folio: o.folio, desde: haceMin(45), paso: 3, pasos: 6 };
    }
    return banco;
  }
}
