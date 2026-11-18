import { ProductoInventario } from '../cajera/inventario/inventario.datos';
import { DiaEstadistico, NOMBRE_POR_SKU } from '../cajera/estadisticas/estadisticas.datos';

/**
 * Cuentas del negocio para el administrador (AD1). Mientras no exista la API de reportes:
 * - la utilidad de mostrador sale del costo de cada producto en Inventario (precio sin IVA − costo);
 * - la de reparaciones usa un margen fijo de prueba (mano de obra y refacciones juntas).
 */
export const MARGEN_TALLER_DEMO = 0.5;
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

/** Descuentos del historial de prueba: 1.7 % de lo vendido en mostrador (Figma AD2.1); los de la app son reales. */
export const DESCUENTO_DEMO = 0.017;

export interface FilaCategoria {
  categoria: string;
  ventas: number;
  costo: number;
  utilidad: number;
  margen: number | null;
  participacion: number | null;
}

/** "Utilidad por categoría" (Figma AD2.1): reparaciones, accesorios, refacciones sueltas, descuentos y total. */
export function porCategoria(d: DiaEstadistico, descuentos: number, buscar: (sku: string) => ProductoInventario | undefined): FilaCategoria[] {
  const grupos: Record<string, { ventas: number; costo: number }> = {
    Reparaciones: { ventas: d.reparaciones, costo: sinIva(d.reparaciones) * (1 - MARGEN_TALLER_DEMO) },
    Accesorios: { ventas: 0, costo: 0 },
    'Refacciones sueltas': { ventas: 0, costo: 0 },
  };
  for (const [nombre, p] of Object.entries(d.productos)) {
    const producto = buscar(SKU_POR_NOMBRE[nombre] ?? '');
    const grupo = producto?.categoria === 'Refacciones' ? grupos['Refacciones sueltas'] : grupos['Accesorios'];
    grupo.ventas += p.ingresos;
    grupo.costo += producto ? producto.costo * p.piezas : sinIva(p.ingresos) * 0.4;
  }
  const total = Object.values(grupos).reduce((s, g) => s + g.ventas, 0) || 1;
  const filas: FilaCategoria[] = Object.entries(grupos).map(([categoria, g]) => {
    const utilidad = sinIva(g.ventas) - g.costo;
    return { categoria, ventas: g.ventas, costo: g.costo, utilidad, margen: g.ventas ? Math.round((utilidad / sinIva(g.ventas)) * 100) : 0, participacion: Math.round((g.ventas / total) * 100) };
  });
  filas.push({ categoria: 'Descuentos', ventas: -descuentos, costo: 0, utilidad: -sinIva(descuentos), margen: null, participacion: null });
  const ventas = filas.reduce((s, f) => s + f.ventas, 0);
  const costo = filas.reduce((s, f) => s + f.costo, 0);
  const utilidad = filas.reduce((s, f) => s + f.utilidad, 0);
  filas.push({ categoria: 'Total', ventas, costo, utilidad, margen: ventas ? Math.round((utilidad / sinIva(ventas)) * 100) : 0, participacion: 100 });
  return filas;
}
