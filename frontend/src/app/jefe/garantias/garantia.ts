import { diasGarantia, Orden, sumarDias } from '../../cajera/ordenes/ordenes.service';

/** Pestañas de Garantías (Figma J4.1). */
export type EtapaGarantia = 'por-dictaminar' | 'en-revision' | 'en-reparacion' | 'cerrada';

/**
 * En revisión: el técnico aún no manda su reporte. Por dictaminar: ya lo mandó y falta el dictamen del jefe.
 * En reparación: el jefe ya dictaminó y el equipo sigue en el taller. Cerrada: lista para entregar o entregada.
 */
export function etapaGarantia(o: Orden): EtapaGarantia | null {
  if (!o.garantia) return null;
  if (o.estado !== 'en-garantia') return 'cerrada';
  if (o.garantia.decision) return 'en-reparacion';
  return o.garantia.reporte ? 'por-dictaminar' : 'en-revision';
}

/** Fecha en que vence la garantía original (30 días desde la entrega). */
export function venceGarantia(o: Orden): string | null {
  return o.entrega ? sumarDias(o.entrega.fecha, diasGarantia()) : null;
}

/** Días de garantía que llevaba usados cuando la pidió ("26 de 30 días"). */
export function diasUsados(o: Orden): number {
  if (!o.entrega || !o.garantia) return 0;
  return Math.max(0, Math.floor((new Date(o.garantia.recibida).getTime() - new Date(o.entrega.fecha).getTime()) / 86_400_000));
}

/** "No aplica · humedad posterior" / "Aplica · pieza defectuosa" */
export function recomendacion(o: Orden): { texto: string; tono: 'peligro' | 'exito' } | null {
  const r = o.garantia?.reporte;
  if (!r) return null;
  return r.recomienda === 'aplica' ? { texto: `Aplica · ${r.motivo}`, tono: 'exito' } : { texto: `No aplica · ${r.motivo}`, tono: 'peligro' };
}
