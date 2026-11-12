import { Injectable, signal } from '@angular/core';
import { REGLAS_TALLER, ReglasTaller } from '../../compartido/reglas-taller';

/** Renglón del tabulador de mano de obra (Figma J9). */
export interface NivelManoObra {
  id: string;
  nivel: string;
  tiempo: string;
  ejemplos: string;
  precio: number;
}

export interface CambioConfiguracion {
  fecha: string;
  por: string;
  texto: string;
}

const NIVELES_DEMO: NivelManoObra[] = [
  { id: 'adicional', nivel: 'Adicional', tiempo: 'Hasta 30 min', ejemplos: 'Trabajo extra en re-cotización', precio: 150 },
  { id: 'bajo', nivel: 'Bajo', tiempo: 'Hasta 1 h', ejemplos: 'Batería, pantalla con marco, limpieza', precio: 300 },
  { id: 'medio', nivel: 'Medio', tiempo: 'Hasta 1 h 30', ejemplos: 'Puerto de carga, conector de batería', precio: 580 },
  { id: 'alto', nivel: 'Alto', tiempo: 'Más de 1 h 30', ejemplos: 'Microsoldadura, humedad en placa', precio: 650 },
  { id: 'revision', nivel: 'Revisión / diagnóstico', tiempo: '—', ejemplos: 'Se cobra si el cliente rechaza o no hay reparación', precio: 300 },
];

/** J9 · Tabulador de mano de obra y reglas del taller (en memoria hasta conectar la API; el administrador las ve en AD9.4). */
@Injectable({ providedIn: 'root' })
export class ConfiguracionTallerService {
  readonly niveles = signal<NivelManoObra[]>(NIVELES_DEMO);
  readonly reglas = signal<ReglasTaller>({ ...REGLAS_TALLER });
  readonly cambios = signal<CambioConfiguracion[]>([]);

  /** Precio del tabulador para "1 h 30 min · nivel medio" o "Mano de obra adicional" (J3.2 y J3.4). */
  precioDe(texto: string): number | null {
    const t = texto.toLowerCase();
    if (t.includes('adicional')) return this.niveles().find((n) => n.id === 'adicional')?.precio ?? null;
    const nivel = t.match(/nivel (\p{L}+)/u)?.[1];
    return nivel ? (this.niveles().find((n) => n.nivel.toLowerCase() === nivel)?.precio ?? null) : null;
  }

  /** Guarda y deja anotado cada cambio. Devuelve los textos de lo que cambió. */
  guardar(niveles: NivelManoObra[], reglas: ReglasTaller, por: string): string[] {
    const cambios: string[] = [];
    const antes = this.reglas();
    const etiquetas: Partial<Record<keyof ReglasTaller, string>> = {
      slaDiagnosticoH: 'Diagnóstico y cotización',
      vigenciaDias: 'Vigencia del presupuesto',
      garantiaDias: 'Garantía por defecto',
      garantiaDesde: 'La garantía cuenta desde',
      diasSinCobro: 'Días sin cobro en bodega',
      almacenajeDia: 'Almacenaje por día',
      despuesResguardo: `Después de ${reglas.diasResguardo} días`,
    };
    for (const [clave, texto] of Object.entries(etiquetas) as [keyof ReglasTaller, string][]) {
      if (antes[clave] !== reglas[clave]) cambios.push(`${texto}: ${antes[clave]} → ${reglas[clave]}`);
    }
    const previos = new Map(this.niveles().map((n) => [n.id, n]));
    for (const n of niveles) {
      const p = previos.get(n.id);
      if (!p) cambios.push(`Nivel nuevo: ${n.nivel} ($${n.precio.toFixed(2)})`);
      else if (p.precio !== n.precio || p.nivel !== n.nivel || p.tiempo !== n.tiempo || p.ejemplos !== n.ejemplos) cambios.push(`Nivel ${n.nivel}: $${p.precio.toFixed(2)} → $${n.precio.toFixed(2)}`);
    }
    for (const p of this.niveles()) if (!niveles.some((n) => n.id === p.id)) cambios.push(`Nivel quitado: ${p.nivel}`);

    const revision = niveles.find((n) => n.id === 'revision')?.precio ?? reglas.revision;
    const nuevas = { ...reglas, revision };
    this.niveles.set(niveles.map((n) => ({ ...n })));
    this.reglas.set(nuevas);
    Object.assign(REGLAS_TALLER, nuevas);
    const fecha = new Date().toISOString();
    this.cambios.update((lista) => [...cambios.map((texto) => ({ fecha, por, texto })), ...lista]);
    return cambios;
  }
}
