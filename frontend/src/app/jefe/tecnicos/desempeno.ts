import { Orden } from '../../cajera/ordenes/ordenes.service';

/**
 * Desempeño del mes por técnico (Figma J7: terminadas, tiempo promedio y % de garantías).
 * Las cifras son de prueba con la escala de Figma (octubre: Carlos 24, Mariana 19, Luis 15) y suman las
 * órdenes que la app entregó ese mes. Cuando exista la API vendrán del registro de tiempos de cada técnico.
 */
const BASE: Record<string, { terminadas: number; minutos: number; garantias: number }> = {
  CR: { terminadas: 24, minutos: 65, garantias: 8 },
  MV: { terminadas: 19, minutos: 80, garantias: 5 },
  LO: { terminadas: 15, minutos: 55, garantias: 0 },
};

export interface MesDesempeno {
  /** "2026-11" */
  clave: string;
  /** "Nov 2026" */
  corto: string;
  /** "noviembre" */
  largo: string;
}

/** El mes actual y los `n - 1` anteriores. */
export function mesesRecientes(n: number): MesDesempeno[] {
  const hoy = new Date();
  return Array.from({ length: n }, (_, i) => {
    const f = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const mes = f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');
    return {
      clave: `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`,
      corto: `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${f.getFullYear()}`,
      largo: f.toLocaleDateString('es-MX', { month: 'long' }),
    };
  });
}

/** Variación estable por técnico y mes (±20 %). */
function variacion(semilla: string): number {
  let h = 0;
  for (const c of semilla) h = (h * 31 + c.charCodeAt(0)) % 1000;
  return 0.8 + (h / 1000) * 0.4;
}

export function desempeno(iniciales: string, mes: string, ordenes: Orden[]): { terminadas: number; promedio: string; garantias: number } {
  const base = BASE[iniciales] ?? { terminadas: 10, minutos: 60, garantias: 5 };
  const hoy = new Date();
  const esActual = mes === `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  // El mes en curso va a la mitad: se escala por los días que lleva.
  const avance = esActual ? hoy.getDate() / new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate() : 1;
  const reales = ordenes.filter((o) => o.tecnico.iniciales === iniciales && o.entrega?.fecha.startsWith(mes)).length;
  const terminadas = Math.round(base.terminadas * variacion(iniciales + mes) * avance) + reales;
  const minutos = Math.round(base.minutos * variacion(mes + iniciales));
  const garantias = base.garantias ? Math.max(0, Math.round(base.garantias * variacion(iniciales + mes + 'g'))) : 0;
  const promedio = minutos >= 60 ? `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')}` : `${minutos} min`;
  return { terminadas, promedio, garantias };
}
