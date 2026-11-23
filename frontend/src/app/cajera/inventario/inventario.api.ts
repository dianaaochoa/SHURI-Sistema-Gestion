import type { Ajuste, ProductoInventario, TipoAjuste } from './inventario.datos';

/** Producto como lo responde la API (ProductResource, docs/api/endpoints.md §9). */
export interface ProductoApi {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  compatible_with: string | null;
  type: 'part' | 'accessory' | 'consumable';
  category?: { id: number; name: string };
  supplier?: { id: number; name: string } | null;
  image_path?: string | null;
  sellable_at_counter: boolean;
  usable_in_workshop: boolean;
  sale_price: number;
  /** Solo con el permiso catalog.view_costs. */
  purchase_price?: number;
  stock: number;
  min_stock: number;
  location: string | null;
  is_active: boolean;
}

/** Renglón del kardex (InventoryMovementResource). */
export interface MovimientoApi {
  id: number;
  type: 'stock_in' | 'adjustment' | 'sale' | 'workshop_use' | 'sale_return' | 'workshop_return' | 'supplier_return' | 'shrinkage';
  type_name: string;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  reason: string | null;
  product?: { id: number; sku: string; name: string };
  user?: string | null;
  service_order_folio?: string | null;
  sale_id: number | null;
  created_at: string;
}

/** Las pantallas agrupan por tipo: Refacciones, Accesorios y Consumibles. */
export const CATEGORIA_DE_TIPO: Record<ProductoApi['type'], string> = { part: 'Refacciones', accessory: 'Accesorios', consumable: 'Consumibles' };
export const TIPO_DE_CATEGORIA: Record<string, ProductoApi['type']> = { Refacciones: 'part', Accesorios: 'accessory', Consumibles: 'consumable' };

/** El "uso interno" (C7.4) es un ajuste con este prefijo en el motivo. */
export const PREFIJO_USO_INTERNO = 'Uso interno: ';

export function productoDeApi(p: ProductoApi, apartados: ProductoInventario['apartados'] = []): ProductoInventario {
  return {
    id: p.id,
    sku: p.sku,
    nombre: p.name,
    categoria: CATEGORIA_DE_TIPO[p.type],
    proveedor: p.supplier?.name ?? '',
    unidad: 'Pieza',
    codigoBarras: p.barcode ?? '',
    // Quien no tiene catalog.view_costs (caja) no recibe el costo
    costo: p.purchase_price ?? 0,
    precio: p.sale_price,
    stock: p.stock,
    minimo: p.min_stock,
    ubicacion: p.location ?? '',
    apartados,
    foto: p.image_path ?? null,
    usoInterno: !p.sellable_at_counter,
  };
}

/** Ajustes (C7.4) a partir de los movimientos "adjustment" y "shrinkage" del kardex. */
export function ajusteDeApi(m: MovimientoApi, costo: number): Ajuste {
  const motivo = m.reason ?? '';
  const tipo: TipoAjuste = m.type === 'shrinkage' ? 'merma' : motivo.startsWith(PREFIJO_USO_INTERNO) ? 'interno' : 'conteo';
  return {
    folio: `AJ-${String(m.id).padStart(4, '0')}`,
    fecha: m.created_at,
    sku: m.product?.sku ?? '',
    nombre: m.product?.name ?? '',
    tipo,
    diferencia: m.quantity,
    stockAntes: m.previous_stock,
    valor: Math.round(m.quantity * costo * 100) / 100,
    motivo: tipo === 'interno' ? motivo.slice(PREFIJO_USO_INTERNO.length) : motivo,
    hizo: m.user ?? '',
  };
}

/** Texto del kardex del producto (C7.6). */
export function movimientoDeApi(m: MovimientoApi): { fecha: string; texto: string; cantidad: number; folio: string } {
  const detalle = m.service_order_folio ? ` · ${m.service_order_folio}` : m.reason ? ` · ${m.reason}` : '';
  return { fecha: m.created_at, texto: `${m.type_name}${detalle}`, cantidad: m.quantity, folio: m.sale_id ? `Venta ${m.sale_id}` : `MOV-${m.id}` };
}
