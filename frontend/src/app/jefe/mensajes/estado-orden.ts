import { ESTADOS_ORDEN, Orden } from '../../cajera/ordenes/ordenes.service';
import { etapaGarantia } from '../garantias/garantia';
import { etapaDe, pendienteDeCotizar } from '../etapas';

/** Estado de la orden como lo ve el jefe en el chat (Figma J11: "Garantía · por dictaminar"). */
export function estadoOrden(o: Orden): { texto: string; tono: string } {
  const g = etapaGarantia(o);
  if (g === 'por-dictaminar') return { texto: 'Garantía · por dictaminar', tono: 'advertencia' };
  if (g === 'en-revision') return { texto: 'Garantía · en revisión', tono: 'neutro' };
  if (g === 'en-reparacion') return { texto: 'Garantía · en reparación', tono: 'info' };
  if (o.danoAdicional) return { texto: 'En taller · daño adicional', tono: 'advertencia' };
  if (o.sinReparacion) return { texto: 'Sin reparación · por confirmar', tono: 'peligro' };
  if (etapaDe(o) === 'diagnostico') return { texto: 'En diagnóstico', tono: 'neutro' };
  return ESTADOS_ORDEN[o.estado];
}

/** Lo que el jefe puede resolver desde el chat (botón del panel de la orden). */
export function accionOrden(o: Orden): { texto: string; ruta: string; consulta: { folio: string }; aviso: string } {
  const folio = o.folio.replace('#', '');
  if (etapaGarantia(o) === 'por-dictaminar') {
    return { texto: 'Dictaminar garantía', ruta: '/jefe/garantias', consulta: { folio }, aviso: 'Tu dictamen se publica en el portal del cliente y le avisamos en este chat.' };
  }
  if (pendienteDeCotizar(o)) {
    const texto = o.danoAdicional ? 'Re-cotizar' : o.sinReparacion ? 'Confirmar sin reparación' : 'Cotizar';
    return { texto, ruta: '/jefe/por-cotizar', consulta: { folio }, aviso: 'Lo que envíes llega a su portal y le avisamos en este chat.' };
  }
  return { texto: 'Ver orden', ruta: '/jefe/tablero-de-ordenes', consulta: { folio }, aviso: 'El cliente ve el mismo estado en su portal.' };
}
