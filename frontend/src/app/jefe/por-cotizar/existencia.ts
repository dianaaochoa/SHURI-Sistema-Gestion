import { Concepto } from '../../cajera/ordenes/ordenes.service';
import { InventarioService } from '../../cajera/inventario/inventario.service';

/** "3 en stock · se aparta", "Sin stock · llega 17 oct" (Figma J3.2 / J3.4). */
export function existencia(inventario: InventarioService, c: Concepto, folio: string): { texto: string; tono: 'exito' | 'advertencia'; enStock: boolean } | null {
  if (c.tipo !== 'refaccion' || !c.sku) return null;
  const hay = inventario.paraOrden(c.sku, folio);
  if (hay >= c.cantidad) return { texto: `${hay} en stock · se aparta`, tono: 'exito', enStock: true };
  const llega = inventario.llegada(c.sku);
  return { texto: llega ? `Sin stock · llega ${diaMes(llega)}` : 'Sin stock · se pide', tono: 'advertencia', enStock: false };
}

/** "17 oct" */
export function diaMes(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;
}
