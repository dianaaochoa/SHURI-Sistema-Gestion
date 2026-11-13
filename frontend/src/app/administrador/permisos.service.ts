import { Injectable, signal } from '@angular/core';
import { Rol } from '../acceso/auth.service';

export type ClavePermiso = 'vender' | 'descuentos' | 'cancelar' | 'retiros' | 'costos' | 'precios' | 'mercancia' | 'pedidos' | 'cotizar' | 'banco' | 'reportes' | 'usuarios';

export const ROLES: { rol: Rol; texto: string; detalle: string }[] = [
  { rol: 'cajera', texto: 'Cajera', detalle: 'Caja y ventas' },
  { rol: 'tecnico', texto: 'Técnico', detalle: 'Banco de trabajo' },
  { rol: 'jefe-tecnicos', texto: 'Jefe de técnicos', detalle: 'Taller completo' },
  { rol: 'administrador', texto: 'Administrador', detalle: 'Todo' },
];

/** Permisos de Figma AD7.3, con las notas que van junto a la casilla. */
export const PERMISOS: { clave: ClavePermiso; texto: string; notas?: Partial<Record<Rol, string>> }[] = [
  { clave: 'vender', texto: 'Vender en punto de venta' },
  { clave: 'descuentos', texto: 'Aplicar descuentos', notas: { administrador: 'sin límite' } },
  { clave: 'cancelar', texto: 'Cancelar ventas y devoluciones' },
  { clave: 'retiros', texto: 'Retiros y pagos a proveedor desde caja' },
  { clave: 'costos', texto: 'Ver costos y utilidad' },
  { clave: 'precios', texto: 'Editar precios del catálogo' },
  { clave: 'mercancia', texto: 'Recibir mercancía y ajustar inventario', notas: { cajera: 'contra pedido' } },
  { clave: 'pedidos', texto: 'Hacer pedidos a proveedor' },
  { clave: 'cotizar', texto: 'Cotizar y dictaminar garantías' },
  { clave: 'banco', texto: 'Trabajar órdenes en banco' },
  { clave: 'reportes', texto: 'Ver reportes y cortes de todos', notas: { 'jefe-tecnicos': 'solo taller' } },
  { clave: 'usuarios', texto: 'Administrar usuarios y configuración' },
];

export type MatrizPermisos = Record<ClavePermiso, Record<Rol, boolean>>;

const fila = (cajera: boolean, tecnico: boolean, jefe: boolean, admin: boolean): Record<Rol, boolean> => ({ cajera, tecnico, 'jefe-tecnicos': jefe, administrador: admin });

const MATRIZ_DEMO: MatrizPermisos = {
  vender: fila(true, false, false, true),
  descuentos: fila(true, false, false, true),
  cancelar: fila(true, false, false, true),
  retiros: fila(true, false, false, true),
  costos: fila(false, false, true, true),
  precios: fila(false, false, false, true),
  mercancia: fila(true, false, true, true),
  pedidos: fila(false, false, true, true),
  cotizar: fila(false, false, true, true),
  banco: fila(false, true, true, false),
  reportes: fila(false, false, false, true),
  usuarios: fila(false, false, false, true),
};

/** Niveles de descuento que el administrador puede dar a la cajera (0 a 20 %). */
export const NIVELES_DESCUENTO = [0, 5, 10, 15, 20];
export const textoDescuento = (n: number) => (n === 0 ? 'Sin descuentos' : `Hasta ${n}%${n === 20 ? ' (máximo)' : ''}`);

/**
 * AD7.3 · Qué puede hacer cada rol. Simulado: se guarda en memoria y las pantallas todavía no lo consultan
 * (al conectar la API, el servidor revisará cada permiso).
 */
@Injectable({ providedIn: 'root' })
export class PermisosService {
  readonly matriz = signal<MatrizPermisos>(MATRIZ_DEMO);
  /** Descuento máximo por omisión para las cajeras nuevas. */
  readonly descuentoCajera = signal(10);

  guardar(matriz: MatrizPermisos, descuento: number): void {
    // El administrador nunca pierde el acceso a usuarios y configuración.
    this.matriz.set({ ...matriz, usuarios: { ...matriz.usuarios, administrador: true } });
    this.descuentoCajera.set(descuento);
  }
}
