/**
 * Datos de prueba de Inventario (C7), tomados de Figma C7.1–C7.7. Se reemplazan por la API.
 * Precio de venta con IVA incluido (como en el alta de producto C7.1); costo sin IVA.
 */

export const IVA = 0.16;
export const CATEGORIAS_INVENTARIO = ['Accesorios', 'Refacciones', 'Consumibles'];
export const PROVEEDORES = ['Distribuidora MovilTec', 'Refacciones Móviles del Centro', 'Importadora Celular GDL'];
export const UNIDADES = ['Pieza', 'Juego', 'Caja', 'Litro', 'Metro'];
export const JEFE_TECNICOS = 'Jorge López';

/** Piezas apartadas para una orden de reparación. */
export interface Apartado {
  cantidad: number;
  folio: string;
}

export interface ProductoInventario {
  sku: string;
  nombre: string;
  categoria: string;
  proveedor: string;
  unidad: string;
  codigoBarras: string;
  /** Costo unitario promedio, sin IVA. */
  costo: number;
  /** Precio de venta con IVA incluido. */
  precio: number;
  stock: number;
  /** Stock mínimo: al llegar a él se marca "Stock bajo". */
  minimo: number;
  ubicacion: string;
  apartados: Apartado[];
  /** Miniatura (ruta de assets o foto subida). */
  foto: string | null;
  /** Solo lo usa el taller (no se vende en Punto de venta). */
  usoInterno?: boolean;
}

const foto = (n: number) => `assets/inventario/foto-${n}.jpg`;
const p = (datos: Omit<ProductoInventario, 'apartados' | 'unidad' | 'ubicacion'> & Partial<ProductoInventario>): ProductoInventario => ({
  unidad: 'Pieza',
  ubicacion: '',
  apartados: [],
  ...datos,
});

export const PRODUCTOS_DEMO: ProductoInventario[] = [
  p({ sku: 'REF-S22-USB', nombre: 'Puerto USB-C Samsung S22 Ultra', categoria: 'Refacciones', proveedor: 'Refacciones Móviles del Centro', codigoBarras: '7502000000117', costo: 310, precio: 650, stock: 8, minimo: 4, foto: foto(1), ubicacion: 'Cajón R-2' }),
  p({ sku: 'REF-S22-FLX', nombre: 'Flex de carga Samsung S22 Ultra', categoria: 'Refacciones', proveedor: 'Refacciones Móviles del Centro', codigoBarras: '7502000000124', costo: 120, precio: 278, stock: 8, minimo: 4, foto: foto(2), ubicacion: 'Cajón R-2' }),
  p({ sku: 'ACC-001', nombre: 'Mica Cristal templado universal', categoria: 'Accesorios', proveedor: 'Distribuidora MovilTec', codigoBarras: '7501000000014', costo: 27.5, precio: 100, stock: 124, minimo: 20, foto: foto(3), ubicacion: 'Vitrina 1 · Charola A' }),
  p({ sku: 'ACC-020', nombre: 'Cargador USB-C 20W blanco', categoria: 'Accesorios', proveedor: 'Distribuidora MovilTec', codigoBarras: '7501000000205', costo: 104, precio: 250, stock: 32, minimo: 10, foto: foto(4), ubicacion: 'Vitrina 2 · Charola A' }),
  p({ sku: 'ACC-014', nombre: 'Cable USB-C 1 metro', categoria: 'Accesorios', proveedor: 'Distribuidora MovilTec', codigoBarras: '7501000000144', costo: 48, precio: 150, stock: 56, minimo: 10, foto: foto(5), ubicacion: 'Vitrina 2 · Charola C' }),
  p({ sku: 'REF-IP13-LCD', nombre: 'Pantalla OLED iPhone 13', categoria: 'Refacciones', proveedor: 'Refacciones Móviles del Centro', codigoBarras: '7502000000216', costo: 1208, precio: 2400, stock: 2, minimo: 3, foto: foto(3), ubicacion: 'Cajón R-1' }),
  p({ sku: 'REF-A54-BAT', nombre: 'Batería Samsung A54 5,000 mAh', categoria: 'Refacciones', proveedor: 'Distribuidora MovilTec', codigoBarras: '7502000000315', costo: 205, precio: 490, stock: 18, minimo: 5, foto: foto(6), ubicacion: 'Cajón R-3' }),
  p({ sku: 'ACC-032', nombre: 'Funda silicón iPhone 14 negra', categoria: 'Accesorios', proveedor: 'Importadora Celular GDL', codigoBarras: '7501000000328', costo: 42, precio: 128.45, stock: 44, minimo: 10, foto: foto(7), ubicacion: 'Exhibidor fundas' }),
  p({ sku: 'CON-007', nombre: 'Adhesivo B-7000 transparente', categoria: 'Consumibles', proveedor: 'Refacciones Móviles del Centro', codigoBarras: '7501000000076', costo: 22, precio: 60, stock: 12, minimo: 5, foto: foto(8), ubicacion: 'Taller · repisa 1' }),
  p({ sku: 'REF-IP14-BAT', nombre: 'Batería iPhone 14', categoria: 'Refacciones', proveedor: 'Refacciones Móviles del Centro', codigoBarras: '7502000000414', costo: 380, precio: 850, stock: 3, minimo: 3, foto: foto(3), ubicacion: 'Cajón R-3', apartados: [{ cantidad: 1, folio: '#1043' }] }),
  p({ sku: 'ACC-046', nombre: 'Audífonos alámbricos USB-C', categoria: 'Accesorios', proveedor: 'Importadora Celular GDL', codigoBarras: '7501000000465', costo: 95, precio: 214.66, stock: 6, minimo: 3, foto: foto(9), ubicacion: 'Vitrina 2 · Charola B' }),
  p({ sku: 'REF-IP12-PAN', nombre: 'Pantalla OLED iPhone 12', categoria: 'Refacciones', proveedor: 'Refacciones Móviles del Centro', codigoBarras: '7502000000513', costo: 410, precio: 850, stock: 1, minimo: 2, foto: foto(6), ubicacion: 'Cajón R-1', apartados: [{ cantidad: 1, folio: '#1035' }] }),
  // Del punto de venta y de los avisos de Inicio (C1.4).
  p({ sku: 'ACC-021', nombre: 'Cargador USB-C 35W doble puerto', categoria: 'Accesorios', proveedor: 'Distribuidora MovilTec', codigoBarras: '7501000000212', costo: 190, precio: 420, stock: 2, minimo: 4, foto: foto(4) }),
  p({ sku: 'ACC-025', nombre: 'Cargador inalámbrico MagSafe 15W', categoria: 'Accesorios', proveedor: 'Importadora Celular GDL', codigoBarras: '7501000000250', costo: 260, precio: 590, stock: 12, minimo: 4, foto: null }),
  p({ sku: 'ACC-030', nombre: 'Cargador de auto USB-C + USB-A', categoria: 'Accesorios', proveedor: 'Distribuidora MovilTec', codigoBarras: '7501000000304', costo: 120, precio: 280, stock: 0, minimo: 3, foto: null }),
  p({ sku: 'ACC-052', nombre: 'Funda uso rudo transparente', categoria: 'Accesorios', proveedor: 'Importadora Celular GDL', codigoBarras: '7501000000526', costo: 70, precio: 200, stock: 18, minimo: 6, foto: foto(7) }),
  p({ sku: 'REF-IP11-BAT', nombre: 'Batería iPhone 11', categoria: 'Refacciones', proveedor: 'Refacciones Móviles del Centro', codigoBarras: '7502000000612', costo: 210, precio: 480, stock: 2, minimo: 3, foto: foto(3), ubicacion: 'Cajón R-3' }),
  p({ sku: 'REF-IP11-SEL', nombre: 'Kit de sellos iPhone 11', categoria: 'Refacciones', proveedor: 'Refacciones Móviles del Centro', codigoBarras: '7502000000629', costo: 120, precio: 260, stock: 0, minimo: 0, foto: null, ubicacion: 'Cajón R-4' }),
  p({ sku: 'REF-IP14-FLX', nombre: 'Conector flex batería iPhone 14', categoria: 'Refacciones', proveedor: 'Refacciones Móviles del Centro', codigoBarras: '7502000000711', costo: 95, precio: 240, stock: 0, minimo: 0, foto: null, ubicacion: 'Cajón R-4' }),
];

// ---------- Pedidos del jefe de técnicos (C7.5) ----------

export type FormaPago = 'efectivo' | 'transferencia' | 'credito';
export const FORMAS_PAGO: Record<FormaPago, { texto: string; corto: string; tono: string }> = {
  efectivo: { texto: 'Efectivo de caja · pago a proveedor', corto: 'Efectivo de caja', tono: 'info' },
  transferencia: { texto: 'Transferencia (la paga gerencia)', corto: 'Transferencia', tono: 'neutro' },
  credito: { texto: 'Crédito del proveedor', corto: 'Crédito', tono: 'advertencia' },
};

export interface LineaPedido {
  sku: string;
  cantidad: number;
  costo: number;
  /** Orden para la que se aparta la pieza. */
  orden?: string;
}

export interface Pedido {
  folio: string;
  proveedor: string;
  lineas: LineaPedido[];
  pago: FormaPago;
  /** Fecha estimada de llegada (ISO). */
  llega: string;
  jefe: string;
}

// ---------- Entradas (C7.3 / C7.7) ----------

export interface LineaEntrada {
  sku: string;
  nombre: string;
  cantidad: number;
  costo: number;
  orden?: string;
}

export interface Entrada {
  folio: string;
  fecha: string;
  proveedor: string;
  documento: string;
  pedido: string | null;
  lineas: LineaEntrada[];
  subtotal: number;
  iva: number;
  total: number;
  pago: FormaPago;
  recibio: string;
  fotoFactura: boolean;
  /** Diferencia con lo facturado o lo pedido. */
  nota?: string;
}

// ---------- Ajustes (C7.4) ----------

export type TipoAjuste = 'merma' | 'conteo' | 'interno';
export const TIPOS_AJUSTE: Record<TipoAjuste, { texto: string; icono: string; tono: string }> = {
  merma: { texto: 'Merma / daño', icono: 'trash-20', tono: 'peligro' },
  conteo: { texto: 'Conteo físico', icono: 'list-20', tono: 'info' },
  interno: { texto: 'Uso interno', icono: 'package-20', tono: 'neutro' },
};

export interface Ajuste {
  folio: string;
  fecha: string;
  sku: string;
  nombre: string;
  tipo: TipoAjuste;
  /** Negativo descuenta, positivo suma (solo en conteo físico). */
  diferencia: number;
  stockAntes: number;
  /** Valor a costo de la diferencia. */
  valor: number;
  motivo: string;
  hizo: string;
}

/** Fecha ISO de hace `dias` días a la hora indicada. */
export function haceDias(dias: number, hora = '10:00'): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  const [h, m] = hora.split(':').map(Number);
  fecha.setHours(h, m, 0, 0);
  return fecha.toISOString();
}

const linea = (sku: string, nombre: string, cantidad: number, costo: number): LineaEntrada => ({ sku, nombre, cantidad, costo });
const conTotales = (e: Omit<Entrada, 'subtotal' | 'iva' | 'total'>): Entrada => {
  const subtotal = e.lineas.reduce((s, l) => s + l.cantidad * l.costo, 0);
  const iva = redondear(subtotal * IVA);
  return { ...e, subtotal, iva, total: subtotal + iva };
};

export const ENTRADAS_DEMO: Entrada[] = [
  conTotales({
    folio: 'ENT-0055', fecha: haceDias(3, '11:40'), proveedor: 'Distribuidora MovilTec', documento: 'FAC-A-20931', pedido: null, pago: 'credito', recibio: 'Ana Martínez', fotoFactura: true,
    lineas: [linea('ACC-001', 'Mica cristal templado universal', 50, 27), linea('ACC-020', 'Cargador USB-C 20W blanco', 20, 105), linea('REF-IP13-LCD', 'Pantalla OLED iPhone 13', 3, 1180), linea('ACC-014', 'Cable USB-C 1 metro', 30, 42), linea('REF-A54-BAT', 'Batería Samsung A54 5,000 mAh', 5, 205)],
  }),
  conTotales({
    folio: 'ENT-0054', fecha: haceDias(3, '09:15'), proveedor: 'Distribuidora MovilTec', documento: 'FAC-A-20918', pedido: 'PED-0121', pago: 'transferencia', recibio: 'Luis Peña', fotoFactura: true,
    lineas: [linea('REF-A54-BAT', 'Batería Samsung A54 5,000 mAh', 4, 205), linea('REF-S22-USB', 'Puerto USB-C Samsung S22 Ultra', 2, 310)],
    nota: 'PED-0121 llegó incompleto (faltan 2 baterías A54). El jefe ya lo reclamó al proveedor.',
  }),
  conTotales({
    folio: 'ENT-0053', fecha: haceDias(5, '16:30'), proveedor: 'Refacciones Móviles del Centro', documento: 'REM-8790', pedido: 'PED-0120', pago: 'efectivo', recibio: 'Luis Peña', fotoFactura: false,
    lineas: [linea('REF-S22-FLX', 'Flex de carga Samsung S22 Ultra', 3, 100)],
  }),
];

export const AJUSTES_DEMO: Ajuste[] = [
  { folio: 'AJ-0018', fecha: haceDias(1, '18:20'), sku: 'ACC-001', nombre: 'Mica Cristal templado universal', tipo: 'merma', diferencia: -2, stockAntes: 126, valor: -55, motivo: 'Se estrellaron al instalarlas en mostrador', hizo: 'Ana Martínez' },
  { folio: 'AJ-0017', fecha: haceDias(4, '20:05'), sku: 'ACC-046', nombre: 'Audífonos alámbricos USB-C', tipo: 'conteo', diferencia: -1, stockAntes: 7, valor: -95, motivo: 'Conteo de cierre de mes: faltó 1 pieza', hizo: 'Luis Peña' },
  { folio: 'AJ-0016', fecha: haceDias(6, '12:00'), sku: 'CON-007', nombre: 'Adhesivo B-7000 transparente', tipo: 'interno', diferencia: -1, stockAntes: 13, valor: -22, motivo: 'Para el taller (reposición de repisa)', hizo: 'Ana Martínez' },
];

export const PEDIDOS_DEMO: Pedido[] = [
  { folio: 'PED-0123', proveedor: 'Refacciones Móviles del Centro', pago: 'efectivo', llega: haceDias(0, '13:00'), jefe: JEFE_TECNICOS, lineas: [{ sku: 'REF-IP11-SEL', cantidad: 1, costo: 120, orden: '#1028' }, { sku: 'CON-007', cantidad: 10, costo: 22 }] },
  { folio: 'PED-0124', proveedor: 'Refacciones Móviles del Centro', pago: 'transferencia', llega: haceDias(-1, '12:00'), jefe: JEFE_TECNICOS, lineas: [{ sku: 'REF-IP14-FLX', cantidad: 2, costo: 95, orden: '#1043' }] },
];

export function redondear(importe: number): number {
  return Math.round(importe * 100) / 100;
}
