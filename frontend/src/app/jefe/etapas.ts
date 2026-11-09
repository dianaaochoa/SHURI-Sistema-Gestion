import { Orden, POR_ASIGNAR } from '../cajera/ordenes/ordenes.service';

/** Columnas del tablero del jefe (Figma J2.1). */
export type Etapa = 'recibido' | 'diagnostico' | 'por-cotizar' | 'por-aprobar' | 'en-taller' | 'listo';

export const ETAPAS: { id: Etapa; texto: string; color: string }[] = [
  { id: 'recibido', texto: 'Recibido', color: 'var(--color-texto-tenue)' },
  { id: 'diagnostico', texto: 'Diagnóstico', color: 'var(--color-primario)' },
  { id: 'por-cotizar', texto: 'Por cotizar', color: 'var(--color-peligro)' },
  { id: 'por-aprobar', texto: 'Por aprobar', color: 'var(--color-advertencia)' },
  { id: 'en-taller', texto: 'En taller', color: 'var(--color-primario)' },
  { id: 'listo', texto: 'Listo', color: 'var(--color-exito)' },
];

/** Horas para tener el diagnóstico desde que se recibe (SLA de Figma J2: 24 h). */
export const SLA_DIAGNOSTICO_H = 24;

/**
 * En qué columna va la orden. Las vencidas, en bodega y entregadas ya no están en el taller.
 * "Por cotizar" de la app se parte en tres: sin técnico (Recibido), sin diagnóstico (Diagnóstico) y con diagnóstico (Por cotizar).
 */
export function etapaDe(o: Orden): Etapa | null {
  switch (o.estado) {
    case 'por-cotizar':
      return o.tecnico === POR_ASIGNAR ? 'recibido' : o.diagnostico ? 'por-cotizar' : 'diagnostico';
    case 'por-aprobar':
      return 'por-aprobar';
    case 'en-taller':
    case 'esperando-refaccion':
    case 'adicional':
    case 'en-garantia':
      return 'en-taller';
    case 'lista':
    case 'garantia-lista':
    case 'sin-reparacion':
      return 'listo';
    default:
      return null;
  }
}

/** Desde cuándo está en su columna. */
export function inicioEtapa(o: Orden): string {
  switch (etapaDe(o)) {
    case 'por-cotizar':
      return o.diagnostico!.fecha;
    case 'por-aprobar':
      return o.presupuesto?.enviado ?? o.recibido;
    case 'en-taller':
      return o.pausa?.desde ?? o.garantia?.recibida ?? o.adicional?.enviado ?? o.presupuesto?.aprobado ?? o.recibido;
    case 'listo':
      return o.listaDesde ?? o.recibido;
    default:
      return o.recibido;
  }
}

export const horasDesde = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3_600_000;

/** Pasó más de 24 h sin cotizar (las reportadas sin reparación ya esperan al jefe, no al técnico). */
export function atrasada(o: Orden): boolean {
  const e = etapaDe(o);
  return !o.sinReparacion && (e === 'recibido' || e === 'diagnostico' || e === 'por-cotizar') && horasDesde(o.recibido) > SLA_DIAGNOSTICO_H;
}

/** Lo que el jefe resuelve en Por cotizar (J3): cotizar, confirmar sin reparación o re-cotizar. */
export function pendienteDeCotizar(o: Orden): boolean {
  return !!o.sinReparacion || !!o.danoAdicional || etapaDe(o) === 'por-cotizar';
}

/** "25 min", "6 h", "1 día" (Figma J2.1). Las atrasadas se dicen en horas ("26 h"). */
export function tiempoEn(iso: string, enHoras = false): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24 || enHoras) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'día' : 'días'}`;
}
