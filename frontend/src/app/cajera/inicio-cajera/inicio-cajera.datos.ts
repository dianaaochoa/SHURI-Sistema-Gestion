/**
 * Inicio de la cajera (C1.1 turno abierto / C1.2 caja cerrada): tipos de indicadores y paneles, y los accesos rápidos.
 * Los indicadores y paneles se calculan con los datos de la app (inicio-cajera.paneles.ts).
 */

export type Tono = 'exito' | 'neutro' | 'peligro' | 'advertencia' | 'info';

export interface Acceso {
  etiqueta: string;
  icono: string;
  tecla: string;
  ruta: string;
  /** Solo funciona con la caja abierta (Figma C1.2: aparece atenuado). */
  requiereCaja: boolean;
}

export interface Indicador {
  valor: string;
  titulo: string;
  detalle: string;
  /** Las cifras de conteo usan 28 px; los importes 22 px. */
  conteo?: boolean;
  tono?: 'exito' | 'tenue';
}

export interface Fila {
  titulo: string;
  detalle: string;
  ruta: string;
  estado?: { texto: string; tono: Tono };
  monto?: string;
}

export type Panel =
  | {
      tipo: 'lista';
      titulo: string;
      icono: string;
      insignia: { valor: number; tono: Tono };
      filas: Fila[];
      enlace: { texto: string; ruta: string };
    }
  | { tipo: 'avisos'; titulo: string; avisos: string[] }
  | { tipo: 'corte'; titulo: string; filas: { etiqueta: string; valor: string; exito?: boolean }[] };

export const ACCESOS: Acceso[] = [
  { etiqueta: 'Nueva venta', icono: 'cart', tecla: 'F1', ruta: 'punto-de-venta', requiereCaja: true },
  { etiqueta: 'Nueva orden', icono: 'clip-plus', tecla: 'F3', ruta: 'nueva-orden', requiereCaja: false },
  { etiqueta: 'Entregar equipo', icono: 'package-check', tecla: 'F4', ruta: 'entrega-de-equipo', requiereCaja: true },
  { etiqueta: 'Buscar folio', icono: 'search', tecla: 'F5', ruta: 'ordenes-de-servicio', requiereCaja: false },
];
