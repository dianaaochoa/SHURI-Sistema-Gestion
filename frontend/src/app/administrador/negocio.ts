import { ProductoInventario } from '../cajera/inventario/inventario.datos';
import { DiaEstadistico, NOMBRE_POR_SKU } from '../cajera/estadisticas/estadisticas.datos';

/**
 * Cuentas del negocio para el administrador (AD1). Mientras no exista la API de reportes:
 * - la utilidad de mostrador sale del costo de cada producto en Inventario (precio sin IVA − costo);
 * - la de reparaciones usa un margen fijo de prueba (mano de obra y refacciones juntas).
 */
export const MARGEN_TALLER_DEMO = 0.5;
/** Días de crédito de los proveedores para avisar del pago (dato de prueba). */
export const DIAS_CREDITO_DEMO = 30;
/** Meta de la tasa de garantías del taller (Figma AD1.1). */
export const META_GARANTIAS = 5;

const SKU_POR_NOMBRE: Record<string, string> = Object.fromEntries(Object.entries(NOMBRE_POR_SKU).map(([sku, nombre]) => [nombre, sku]));
const sinIva = (monto: number) => monto / 1.16;

export interface Rentable {
  nombre: string;
  vendidos: number;
  ingreso: number;
  utilidad: number;
  margen: number;
}

/** Utilidad de un producto de mostrador; si no está en Inventario se toma un costo del 40 %. */
function utilidadProducto(nombre: string, piezas: number, ingresos: number, buscar: (sku: string) => ProductoInventario | undefined): number {
  const producto = buscar(SKU_POR_NOMBRE[nombre] ?? '');
  const costo = producto ? producto.costo * piezas : sinIva(ingresos) * 0.4;
  return sinIva(ingresos) - costo;
}

/** Ingreso, utilidad y margen de un tramo de días (Figma AD1 "Utilidad bruta"). */
export function utilidadDe(d: DiaEstadistico, buscar: (sku: string) => ProductoInventario | undefined) {
  const mostrador = Object.entries(d.productos).reduce((s, [n, p]) => s + utilidadProducto(n, p.piezas, p.ingresos, buscar), 0);
  const taller = sinIva(d.reparaciones) * MARGEN_TALLER_DEMO;
  const ingreso = d.mostrador + d.reparaciones;
  const utilidad = mostrador + taller;
  return { ingreso, utilidad, margen: ingreso ? Math.round((utilidad / sinIva(ingreso)) * 100) : 0 };
}

/** "Lo que más deja este mes": productos y reparaciones ordenados por utilidad. */
export function masRentables(d: DiaEstadistico, buscar: (sku: string) => ProductoInventario | undefined): Rentable[] {
  const productos = Object.entries(d.productos).map(([nombre, p]) => {
    const utilidad = utilidadProducto(nombre, p.piezas, p.ingresos, buscar);
    return { nombre, vendidos: p.piezas, ingreso: p.ingresos, utilidad, margen: p.ingresos ? Math.round((utilidad / sinIva(p.ingresos)) * 100) : 0 };
  });
  const taller = { nombre: 'Reparaciones del taller', vendidos: d.entregados, ingreso: d.reparaciones, utilidad: sinIva(d.reparaciones) * MARGEN_TALLER_DEMO, margen: Math.round(MARGEN_TALLER_DEMO * 100) };
  return [...productos, taller].sort((a, b) => b.utilidad - a.utilidad).slice(0, 4);
}

/** "De dónde viene el dinero": reparaciones, accesorios y refacciones sueltas (por la categoría en Inventario). */
export function origenDinero(d: DiaEstadistico, buscar: (sku: string) => ProductoInventario | undefined) {
  let accesorios = 0;
  let refacciones = 0;
  for (const [nombre, p] of Object.entries(d.productos)) {
    if (buscar(SKU_POR_NOMBRE[nombre] ?? '')?.categoria === 'Refacciones') refacciones += p.ingresos;
    else accesorios += p.ingresos;
  }
  const total = d.reparaciones + accesorios + refacciones || 1;
  return [
    { texto: 'Reparaciones', monto: d.reparaciones, porcentaje: Math.round((d.reparaciones / total) * 100), color: 'var(--color-primario)' },
    { texto: 'Accesorios', monto: accesorios, porcentaje: Math.round((accesorios / total) * 100), color: 'var(--color-acento)' },
    { texto: 'Refacciones sueltas', monto: refacciones, porcentaje: Math.round((refacciones / total) * 100), color: '#a7b4c2' },
  ];
}
