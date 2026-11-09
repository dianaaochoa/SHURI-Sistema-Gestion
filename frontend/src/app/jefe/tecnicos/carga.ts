import { EstadoOrden, Orden, Tecnico } from '../../cajera/ordenes/ordenes.service';

/** Órdenes que cuentan como carga de un técnico (siguen en el taller o esperan entrega). */
export const EN_TALLER: EstadoOrden[] = ['por-cotizar', 'por-aprobar', 'adicional', 'en-taller', 'esperando-refaccion', 'en-garantia', 'lista', 'garantia-lista', 'sin-reparacion'];

/** Con 5 órdenes o más el técnico está "Ocupado" (Figma J1.1 y J7). */
export const CARGA_ALTA = 5;

/** Carga de un técnico: sus órdenes, la que trae en curso o en pausa y su estado (J1.1 "Carga por técnico" y J7). */
export function cargaTecnico(t: Tecnico, ordenes: Orden[]) {
  const suyas = ordenes.filter((o) => o.tecnico.iniciales === t.iniciales && EN_TALLER.includes(o.estado));
  const enCurso = suyas.find((o) => ['en-taller', 'adicional', 'en-garantia', 'por-cotizar'].includes(o.estado));
  const enPausa = !enCurso ? suyas.find((o) => o.estado === 'esperando-refaccion') : undefined;
  const estado =
    suyas.length >= CARGA_ALTA ? { texto: 'Ocupado', tono: 'advertencia' } : enPausa ? { texto: 'En pausa', tono: 'neutro' } : { texto: 'Disponible', tono: 'exito' };
  return { suyas, enCurso, enPausa, estado };
}
