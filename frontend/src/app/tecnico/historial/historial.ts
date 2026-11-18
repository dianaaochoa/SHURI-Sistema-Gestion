import { EstadoOrden, Orden, diasGarantia } from '../../cajera/ordenes/ordenes.service';
import { REGLAS_TALLER } from '../../compartido/reglas-taller';
import { etapaGarantia } from '../../jefe/garantias/garantia';

const DIA = 86_400_000;

/** Estados de un equipo que el técnico ya terminó (Figma T6: lista, entregada, en bodega o de vuelta en garantía). */
const TERMINADOS: EstadoOrden[] = ['lista', 'terminada', 'vencida', 'bodega', 'en-garantia', 'garantia-lista'];

/** El equipo cuenta en "Mi historial": lo terminó y no fue un "sin reparación". */
export const terminado = (o: Orden) => !!o.listaDesde && TERMINADOS.includes(o.estado) && !o.trabajo.startsWith('Sin reparación');

/** "41 min", "1 h 05" */
export function duracionCorta(ms: number): string {
  if (!ms) return '—';
  const min = Math.round(ms / 60_000);
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`;
}

/** Desde cuándo corre la garantía (Configuración J9: al entregar o al terminar la reparación). */
export function inicioGarantia(o: Orden): string | null {
  return REGLAS_TALLER.garantiaDesde === 'reparacion' ? (o.listaDesde ?? null) : (o.entrega?.fecha ?? null);
}

/** Pastilla de garantía de un equipo terminado (Figma T6.1). */
export function estadoGarantia(o: Orden): { texto: string; tono: string } {
  const g = etapaGarantia(o);
  if (g === 'en-revision') return { texto: 'En revisión', tono: 'advertencia' };
  if (g === 'por-dictaminar') return { texto: 'Esperando dictamen', tono: 'info' };
  if (o.garantia?.decision?.tipo === 'aplica') return { texto: 'Garantía aplicada', tono: 'peligro' };
  if (o.garantia?.decision) return { texto: 'Garantía no aplicó', tono: 'neutro' };
  if (o.estado === 'bodega') return { texto: 'En bodega', tono: 'neutro' };
  const inicio = inicioGarantia(o);
  if (!inicio) return { texto: 'Por entregar', tono: 'neutro' };
  const restan = Math.ceil((new Date(inicio).getTime() + diasGarantia() * DIA - Date.now()) / DIA);
  return restan > 0 ? { texto: `Vigente · ${restan} ${restan === 1 ? 'día' : 'días'}`, tono: 'exito' } : { texto: 'Vencida', tono: 'neutro' };
}
