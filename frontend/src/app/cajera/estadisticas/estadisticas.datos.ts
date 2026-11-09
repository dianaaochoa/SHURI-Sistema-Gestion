/**
 * Historial de prueba para Estadísticas (C9): un resumen por día de los últimos 760 días.
 * Escala tomada de Figma C9 (octubre 2026): ~$48,000 de mostrador, ~$32,000 de reparaciones,
 * ~117 ventas, ~64 equipos entregados y ~82 % de presupuestos aprobados al mes.
 * Es determinista (misma semilla = mismas cifras). Lo reemplaza la API de reportes.
 */

import { MetodoSimple } from '../punto-de-venta/venta.service';

export interface DiaEstadistico {
  /** Fecha local YYYY-MM-DD. */
  dia: string;
  ventas: number;
  /** Total de mostrador (IVA incluido). */
  mostrador: number;
  /** Cobrado por reparaciones (anticipos y saldos). */
  reparaciones: number;
  entregados: number;
  /** Presupuestos que el cliente respondió y cuántos aprobó. */
  respondidos: number;
  aprobados: number;
  /** Piezas e ingresos por producto (nombre). */
  productos: Record<string, { piezas: number; ingresos: number }>;
  metodos: Record<MetodoSimple, number>;
}

/** Productos de mostrador con su precio de venta y qué tanto se venden. */
const PRODUCTOS: { sku: string; nombre: string; precio: number; peso: number }[] = [
  { sku: 'ACC-001', nombre: 'Mica cristal templado', precio: 100, peso: 30 },
  { sku: 'ACC-020', nombre: 'Cargador USB-C 20W', precio: 250, peso: 14 },
  { sku: 'ACC-032', nombre: 'Funda silicón iPhone', precio: 128, peso: 13 },
  { sku: 'ACC-014', nombre: 'Cable USB-C 1 m', precio: 150, peso: 12 },
  { sku: 'ACC-046', nombre: 'Audífonos alámbricos USB-C', precio: 215, peso: 6 },
  { sku: 'ACC-052', nombre: 'Funda uso rudo transparente', precio: 200, peso: 6 },
  { sku: 'ACC-025', nombre: 'Cargador inalámbrico MagSafe 15W', precio: 590, peso: 3 },
  { sku: 'ACC-021', nombre: 'Cargador USB-C 35W doble puerto', precio: 420, peso: 3 },
];
/** Mismo nombre para el historial y las ventas de la app (el catálogo del punto de venta los escribe distinto). */
export const NOMBRE_POR_SKU: Record<string, string> = Object.fromEntries(PRODUCTOS.map((p) => [p.sku, p.nombre]));

const PESO_TOTAL = PRODUCTOS.reduce((s, p) => s + p.peso, 0);

/** Generador pseudoaleatorio con semilla (mulberry32). */
function aleatorio(semilla: number): () => number {
  let a = semilla;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function claveDia(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

/** Los `dias` días anteriores a hoy (hoy no: lo dan las ventas y órdenes reales de la app). Dos años completos para comparar "Año". */
export function historialDemo(dias = 760): DiaEstadistico[] {
  const lista: DiaEstadistico[] = [];
  const hoy = new Date();
  for (let d = dias; d >= 1; d--) {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - d);
    const azar = aleatorio(fecha.getFullYear() * 1000 + fecha.getMonth() * 40 + fecha.getDate());
    // Domingo flojo, sábado fuerte; el negocio crece ~10 % al año.
    const dia = fecha.getDay();
    const ritmo = (dia === 0 ? 0.45 : dia === 6 ? 1.25 : 1) * (0.9 + 0.1 * (1 - d / dias)) * (0.75 + azar() * 0.5);

    const ventas = Math.max(0, Math.round(4 * ritmo));
    const productos: DiaEstadistico['productos'] = {};
    const metodos: DiaEstadistico['metodos'] = { efectivo: 0, tarjeta: 0, transferencia: 0 };
    let mostrador = 0;
    for (let v = 0; v < ventas; v++) {
      let total = 0;
      const piezas = 1 + Math.floor(azar() * 3);
      for (let i = 0; i < piezas; i++) {
        let r = azar() * PESO_TOTAL;
        const p = PRODUCTOS.find((x) => (r -= x.peso) < 0) ?? PRODUCTOS[0];
        const actual = productos[p.nombre] ?? { piezas: 0, ingresos: 0 };
        productos[p.nombre] = { piezas: actual.piezas + 1, ingresos: actual.ingresos + p.precio };
        total += p.precio;
      }
      const m = azar();
      metodos[m < 0.52 ? 'efectivo' : m < 0.85 ? 'tarjeta' : 'transferencia'] += total;
      mostrador += total;
    }

    const entregados = Math.max(0, Math.round(2.1 * ritmo));
    let reparaciones = 0;
    for (let e = 0; e < entregados; e++) reparaciones += Math.round((300 + azar() * 600) / 10) * 10;
    const respondidos = Math.max(0, Math.round(1.7 * ritmo));
    let aprobados = 0;
    for (let i = 0; i < respondidos; i++) if (azar() < 0.82) aprobados++;

    lista.push({ dia: claveDia(fecha), ventas, mostrador, reparaciones, entregados, respondidos, aprobados, productos, metodos });
  }
  return lista;
}
