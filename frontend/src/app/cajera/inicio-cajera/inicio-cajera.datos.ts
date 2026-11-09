/**
 * Datos de prueba del inicio de la cajera, copiados de Figma (C1.1 turno abierto / C1.2 caja cerrada).
 * Se reemplazan por la API cuando exista; la estructura es la que necesitará la pantalla.
 */

export type Tono = 'exito' | 'neutro' | 'peligro' | 'advertencia' | 'info';

export interface Acceso {
  etiqueta: string;
  icono: string;
  tecla: string;
  ruta: string;
  /** Solo funciona con la caja abierta (Figma C1.2: aparece atenuado). */
  requiereCaja: boolean;
}

export interface Indicador {
  valor: string;
  titulo: string;
  detalle: string;
  /** Las cifras de conteo usan 28 px; los importes 22 px. */
  conteo?: boolean;
  tono?: 'exito' | 'tenue';
}

export interface Fila {
  titulo: string;
  detalle: string;
  ruta: string;
  estado?: { texto: string; tono: Tono };
  monto?: string;
}

export type Panel =
  | {
      tipo: 'lista';
      titulo: string;
      icono: string;
      insignia: { valor: number; tono: Tono };
      filas: Fila[];
      enlace: { texto: string; ruta: string };
    }
  | { tipo: 'avisos'; titulo: string; avisos: string[] }
  | { tipo: 'corte'; titulo: string; filas: { etiqueta: string; valor: string; exito?: boolean }[] };

/** Efectivo de ventas del turno (sin el fondo). Con el fondo de $1,000 da los $7,180 de Figma. */
export const VENTAS_EFECTIVO_DEMO = 6180;

export const ACCESOS: Acceso[] = [
  { etiqueta: 'Nueva venta', icono: 'cart', tecla: 'F1', ruta: 'punto-de-venta', requiereCaja: true },
  { etiqueta: 'Nueva orden', icono: 'clip-plus', tecla: 'F3', ruta: 'nueva-orden', requiereCaja: false },
  { etiqueta: 'Entregar equipo', icono: 'package-check', tecla: 'F4', ruta: 'entrega-de-equipo', requiereCaja: true },
  { etiqueta: 'Buscar folio', icono: 'search', tecla: 'F5', ruta: 'ordenes-de-servicio', requiereCaja: false },
];

export const INDICADORES_CERRADA: Indicador[] = [
  { valor: '$0.00', titulo: 'Vendido hoy', detalle: 'Sin turno abierto', tono: 'tenue' },
  { valor: '$1,000', titulo: 'Fondo asignado', detalle: 'Por contar al abrir' },
  { valor: '3', titulo: 'Listos para entregar', detalle: 'Se entregan con caja abierta', conteo: true, tono: 'exito' },
  { valor: '0', titulo: 'Órdenes recibidas', detalle: 'Hoy', conteo: true, tono: 'tenue' },
];

/** Sin "Efectivo en caja": se calcula con el fondo contado al abrir. */
export const INDICADORES_ABIERTA: Indicador[] = [
  { valor: '$6,240', titulo: 'Vendido en el turno', detalle: '23 ventas · 2 en espera' },
  { valor: '4', titulo: 'Entregas hoy', detalle: '2 listos sin recoger', conteo: true, tono: 'exito' },
  { valor: '2', titulo: 'Órdenes recibidas', detalle: 'Hoy · 1 por diagnosticar', conteo: true },
];

const LISTOS: Panel = {
  tipo: 'lista',
  titulo: 'Listos para entregar',
  icono: 'titulo-package-check',
  insignia: { valor: 2, tono: 'exito' },
  filas: [
    {
      titulo: '#1026 · iPhone 11',
      detalle: 'Laura Medina · lista hace 2 días',
      estado: { texto: 'Saldo $650', tono: 'neutro' },
      ruta: 'entrega-de-equipo',
    },
    {
      titulo: '#1021 · Redmi 12C',
      detalle: 'Pedro Núñez · lista hace 2 días',
      estado: { texto: 'Saldo $950', tono: 'neutro' },
      ruta: 'entrega-de-equipo',
    },
  ],
  enlace: { texto: 'Ir a Entrega de equipo', ruta: 'entrega-de-equipo' },
};

const BODEGA: Panel = {
  tipo: 'lista',
  titulo: 'Por enviar a bodega',
  icono: 'titulo-warehouse',
  insignia: { valor: 2, tono: 'peligro' },
  filas: [
    { titulo: '#0954 · iPad 9', detalle: 'Sergio Lara · 44 días sin recoger', ruta: 'ordenes-de-servicio' },
    { titulo: '#0961 · Galaxy A12', detalle: 'Ricardo Gil · 36 días sin recoger', ruta: 'ordenes-de-servicio' },
  ],
  enlace: { texto: 'Revisar en Órdenes de servicio', ruta: 'ordenes-de-servicio' },
};

const VENTAS_RECIENTES: Panel = {
  tipo: 'lista',
  titulo: 'Ventas recientes del turno',
  icono: 'titulo-call',
  insignia: { valor: 2, tono: 'advertencia' },
  filas: [
    { titulo: 'V-00862 · Funda + mica + cargador', detalle: 'Efectivo · hace 5 min', monto: '$1,240', ruta: 'ventas' },
    { titulo: 'V-00861 · Audífonos Bluetooth', detalle: 'Tarjeta · hace 18 min', monto: '$390', ruta: 'ventas' },
  ],
  enlace: { texto: 'Ver ventas del turno', ruta: 'ventas' },
};

const STOCK_BAJO: Panel = {
  tipo: 'lista',
  titulo: 'Stock bajo',
  icono: 'titulo-receipt',
  insignia: { valor: 1, tono: 'advertencia' },
  filas: [
    { titulo: 'Batería iPhone 11 · quedan 2', detalle: 'Mínimo 3 · el jefe ya tiene pedido PED-0123', ruta: 'inventario' },
  ],
  enlace: { texto: 'Ir a Inventario', ruta: 'inventario' },
};

const EN_ESPERA: Panel = {
  tipo: 'lista',
  titulo: 'Ventas en espera',
  icono: 'titulo-pause',
  insignia: { valor: 2, tono: 'info' },
  filas: [
    { titulo: 'V-00864 · Público general', detalle: '$479.00 · pausada hace 4 min', ruta: 'punto-de-venta' },
    { titulo: 'V-00863 · Raúl Ortiz', detalle: '$400.00 · pausada hace 25 min', ruta: 'punto-de-venta' },
  ],
  enlace: { texto: 'Abrir punto de venta', ruta: 'punto-de-venta' },
};

const ULTIMO_CORTE: Panel = {
  tipo: 'corte',
  titulo: 'Último corte de esta caja',
  filas: [
    { etiqueta: 'Corte', valor: 'C-0411 · 12 oct · Vespertino' },
    { etiqueta: 'Cajera', valor: 'Luis Peña' },
    { etiqueta: 'Diferencia', valor: '$0.00 · Cuadrado', exito: true },
    { etiqueta: 'Fondo que dejó', valor: '$1,000.00' },
  ],
};

const AVISOS: Panel = {
  tipo: 'avisos',
  titulo: 'Avisos de inventario',
  avisos: [
    'PED-0123 del jefe llega hoy: recíbelo en Inventario › Entrada contra pedido.',
    'Batería iPhone 12 · sin existencias',
    'Pantalla OLED iPhone 12 · 0 disponibles (1 apartada para #1035)',
  ],
};

/** Tres columnas de dos paneles; con la caja cerrada "Ventas en espera" cambia por "Último corte". */
export const COLUMNAS_ABIERTA: Panel[][] = [
  [LISTOS, BODEGA],
  [VENTAS_RECIENTES, STOCK_BAJO],
  [EN_ESPERA, AVISOS],
];

export const COLUMNAS_CERRADA: Panel[][] = [
  [LISTOS, BODEGA],
  [VENTAS_RECIENTES, STOCK_BAJO],
  [ULTIMO_CORTE, AVISOS],
];
