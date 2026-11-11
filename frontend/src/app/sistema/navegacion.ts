import { Rol } from '../acceso/auth.service';

/** Un destino del menú lateral. `icono` es el nombre del archivo en assets/menu/. */
export interface DestinoMenu {
  etiqueta: string;
  icono: string;
  ruta: string;
  /** Pantalla de Figma que le corresponde (p. ej. "C2"). */
  figma: string;
  insignia?: number;
  /** Texto bajo el ícono en el riel de tablet (Figma T7: "Refacc."). Sin valor se usa la etiqueta. */
  corta?: string;
}

export interface GrupoMenu {
  titulo?: string;
  destinos: DestinoMenu[];
}

export interface NavegacionRol {
  /** Primer segmento de la URL: /cajera/punto-de-venta */
  prefijo: string;
  /** Línea de estado bajo la marca. Provisional: vendrá de la API (turno, órdenes abiertas, etc.). */
  resumen: string;
  grupos: GrupoMenu[];
  /** Figma T7: en el riel de tablet cada ícono lleva su nombre corto debajo. */
  rielConEtiquetas?: boolean;
}

const INICIO = (figma: string): GrupoMenu => ({
  destinos: [{ etiqueta: 'Inicio', icono: 'home', ruta: 'inicio', figma }],
});

/** Menú de cada rol, tal como está en Figma (Navegación lateral · <rol>). */
export const NAVEGACION: Record<Rol, NavegacionRol> = {
  administrador: {
    prefijo: 'administrador',
    resumen: 'Caja 01 abierta',
    grupos: [
      INICIO('AD1'),
      {
        titulo: 'REPORTES',
        destinos: [
          { etiqueta: 'Ventas y utilidad', icono: 'chart', ruta: 'ventas-y-utilidad', figma: 'AD2' },
          { etiqueta: 'Taller', icono: 'wrench', ruta: 'taller', figma: 'AD2' },
          { etiqueta: 'Cortes de caja', icono: 'receipt', ruta: 'cortes-de-caja', figma: 'AD3' },
        ],
      },
      {
        titulo: 'NEGOCIO',
        destinos: [
          { etiqueta: 'Catálogo y precios', icono: 'package', ruta: 'catalogo-y-precios', figma: 'AD4' },
          { etiqueta: 'Proveedores', icono: 'truck', ruta: 'proveedores', figma: 'AD5' },
          { etiqueta: 'Facturación', icono: 'file', ruta: 'facturacion', figma: 'AD6' },
        ],
      },
      {
        titulo: 'EQUIPO',
        destinos: [
          { etiqueta: 'Usuarios y permisos', icono: 'users', ruta: 'usuarios-y-permisos', figma: 'AD7' },
          { etiqueta: 'Bitácora', icono: 'history', ruta: 'bitacora', figma: 'AD8' },
        ],
      },
      {
        titulo: 'AJUSTES',
        destinos: [{ etiqueta: 'Configuración', icono: 'settings', ruta: 'configuracion', figma: 'AD9' }],
      },
    ],
  },
  cajera: {
    prefijo: 'cajera',
    resumen: 'Caja 01 · Turno abierto',
    grupos: [
      INICIO('C1'),
      {
        titulo: 'VENTAS',
        destinos: [
          { etiqueta: 'Punto de venta', icono: 'cart', ruta: 'punto-de-venta', figma: 'C2' },
          { etiqueta: 'Ventas', icono: 'list', ruta: 'ventas', figma: 'C3' },
        ],
      },
      {
        titulo: 'TALLER',
        destinos: [
          { etiqueta: 'Órdenes de servicio', icono: 'clip-list', ruta: 'ordenes-de-servicio', figma: 'C4' },
          { etiqueta: 'Nueva orden', icono: 'clip-plus', ruta: 'nueva-orden', figma: 'C5' },
          { etiqueta: 'Entrega de equipo', icono: 'package-check', ruta: 'entrega-de-equipo', figma: 'C6' },
        ],
      },
      {
        titulo: 'ADMINISTRACIÓN',
        destinos: [
          { etiqueta: 'Inventario', icono: 'package', ruta: 'inventario', figma: 'C7' },
          { etiqueta: 'Clientes', icono: 'users', ruta: 'clientes', figma: 'C8' },
          { etiqueta: 'Estadísticas', icono: 'chart', ruta: 'estadisticas', figma: 'C9' },
          { etiqueta: 'Corte de caja', icono: 'wallet', ruta: 'corte-de-caja', figma: 'C10' },
        ],
      },
    ],
  },
  'jefe-tecnicos': {
    prefijo: 'jefe',
    resumen: '14 órdenes abiertas',
    grupos: [
      INICIO('J1'),
      {
        titulo: 'TALLER',
        destinos: [
          { etiqueta: 'Tablero de órdenes', icono: 'list', ruta: 'tablero-de-ordenes', figma: 'J2' },
          { etiqueta: 'Por cotizar', icono: 'receipt', ruta: 'por-cotizar', figma: 'J3' },
          { etiqueta: 'Garantías', icono: 'shield', ruta: 'garantias', figma: 'J4' },
          { etiqueta: 'Mensajes', icono: 'msg', ruta: 'mensajes', figma: 'J11' },
        ],
      },
      {
        titulo: 'MATERIAL',
        destinos: [
          { etiqueta: 'Refacciones', icono: 'package', ruta: 'refacciones', figma: 'J5' },
          { etiqueta: 'Inventario', icono: 'warehouse', ruta: 'inventario', figma: 'J6' },
        ],
      },
      {
        titulo: 'EQUIPO',
        destinos: [
          { etiqueta: 'Técnicos', icono: 'users', ruta: 'tecnicos', figma: 'J7' },
          { etiqueta: 'Equipos terminados', icono: 'package-check', ruta: 'equipos-terminados', figma: 'J8' },
          { etiqueta: 'Configuración', icono: 'settings', ruta: 'configuracion', figma: 'J9' },
        ],
      },
    ],
  },
  tecnico: {
    prefijo: 'tecnico',
    resumen: '8 equipos asignados',
    rielConEtiquetas: true,
    grupos: [
      INICIO('T1'),
      {
        titulo: 'MI TRABAJO',
        destinos: [
          { etiqueta: 'Equipos asignados', icono: 'clip-list', ruta: 'equipos-asignados', figma: 'T2', corta: 'Equipos' },
          { etiqueta: 'Banco de trabajo', icono: 'wrench', ruta: 'banco-de-trabajo', figma: 'T3', corta: 'Banco' },
          { etiqueta: 'Garantías', icono: 'shield', ruta: 'garantias', figma: 'T4' },
        ],
      },
      {
        titulo: 'MATERIAL',
        destinos: [{ etiqueta: 'Refacciones', icono: 'package', ruta: 'refacciones', figma: 'T5', corta: 'Refacc.' }],
      },
      {
        titulo: 'REGISTRO',
        destinos: [{ etiqueta: 'Mi historial', icono: 'history', ruta: 'mi-historial', figma: 'T6', corta: 'Historial' }],
      },
    ],
  },
};

export function rutaInicio(rol: Rol): string {
  return `/${NAVEGACION[rol].prefijo}/inicio`;
}

export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0].toUpperCase())
    .join('');
}
