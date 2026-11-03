/**
 * Catálogo de prueba del punto de venta, con los productos y precios de Figma (C2.1 y C2.3).
 * Precios antes de IVA, como los muestra el ticket. Se reemplaza por la API de inventario.
 */

export interface Producto {
  sku: string;
  nombre: string;
  categoria: string;
  /** Precio unitario antes de IVA. */
  precio: number;
  /** Stock menos lo apartado para reparaciones (regla de Figma C2.3). */
  disponibles: number;
  codigoBarras: string;
}

export const CATALOGO: Producto[] = [
  { sku: 'ACC-001', nombre: 'Mica Cristal templado', categoria: 'Accesorios', precio: 100, disponibles: 124, codigoBarras: '7501000000014' },
  { sku: 'ACC-014', nombre: 'Cable USB-C 1 metro', categoria: 'Accesorios', precio: 150, disponibles: 40, codigoBarras: '7501000000144' },
  { sku: 'ACC-020', nombre: 'Cargador USB-C 20W blanco', categoria: 'Accesorios', precio: 250, disponibles: 32, codigoBarras: '7501000000205' },
  { sku: 'ACC-021', nombre: 'Cargador USB-C 35W doble puerto', categoria: 'Accesorios', precio: 420, disponibles: 2, codigoBarras: '7501000000212' },
  { sku: 'ACC-025', nombre: 'Cargador inalámbrico MagSafe 15W', categoria: 'Accesorios', precio: 590, disponibles: 12, codigoBarras: '7501000000250' },
  { sku: 'ACC-030', nombre: 'Cargador de auto USB-C + USB-A', categoria: 'Accesorios', precio: 280, disponibles: 0, codigoBarras: '7501000000304' },
  { sku: 'ACC-046', nombre: 'Audífonos alámbricos USB-C', categoria: 'Accesorios', precio: 85, disponibles: 6, codigoBarras: '7501000000465' },
  { sku: 'ACC-052', nombre: 'Funda uso rudo transparente', categoria: 'Accesorios', precio: 200, disponibles: 18, codigoBarras: '7501000000526' },
  { sku: 'CON-007', nombre: 'Adhesivo B-7000 transparente', categoria: 'Consumibles', precio: 22, disponibles: 12, codigoBarras: '7501000000076' },
];

/** Para el selector de categoría del producto temporal (C2.7). */
export const CATEGORIAS = ['Accesorios', 'Refacciones', 'Consumibles', 'Servicios'];

/** Ventas pausadas en este turno (Figma: "En espera (2)"). Se construyen en C2.8 / C2.9. */
export const VENTAS_EN_ESPERA_DEMO = 2;
