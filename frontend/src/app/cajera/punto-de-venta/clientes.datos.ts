/** Clientes de prueba del punto de venta (Figma C2.5 y nombres usados en otras pantallas). Se reemplaza por la API de clientes (C8). */

/** Datos para timbrar la factura (C2.18). */
export interface DatosFiscales {
  rfc: string;
  codigoPostal: string;
  razonSocial: string;
  regimen: string;
  usoCfdi: string;
  correo: string;
}

export interface Cliente {
  id: string;
  nombre: string;
  telefono?: string;
  correo?: string;
  /** Equipos del cliente en el taller (Figma: "1 en taller", "1 listo"). */
  estado?: { texto: string; tono: 'info' | 'exito' };
  fiscal?: DatosFiscales;
  /** Domicilio (C5.2 Nuevo cliente). */
  direccion?: Direccion;
  comentarios?: string;
  /** ISO: alta del cliente (C8 "Cliente desde mar 2025"). */
  desde?: string;
  /** Acceso al portal de seguimiento (C8). */
  portal?: AccesoPortal;
}

export interface AccesoPortal {
  tipo: 'personalizada' | 'temporal';
  /** ISO: cuándo la cambió o cuándo se envió la temporal. */
  fecha: string;
  /** Solo la temporal se puede volver a mostrar e imprimir. */
  temporal?: string;
}

export interface Direccion {
  pais: string;
  estado: string;
  ciudad: string;
  cp: string;
  calle: string;
  exterior: string;
  interior: string;
}

/** "Av. Morelos 456 Int. 3, Torreón, Coahuila, México · CP 27000" */
export function textoDireccion(d: Direccion | undefined): string {
  if (!d) return '';
  const calle = [d.calle, d.exterior, d.interior ? `Int. ${d.interior}` : ''].filter(Boolean).join(' ');
  const lugar = [calle, d.ciudad, d.estado, d.pais].filter(Boolean).join(', ');
  return d.cp ? `${lugar} · CP ${d.cp}` : lugar;
}

/** Estados de México para el domicilio del cliente. */
export const ESTADOS_MEXICO = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua', 'Ciudad de México', 'Coahuila',
  'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit',
  'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas',
  'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
];

/** Catálogo del SAT: régimen fiscal del receptor (los más comunes en mostrador). */
export const REGIMENES_FISCALES = [
  { clave: '601', nombre: 'General de Ley Personas Morales' },
  { clave: '603', nombre: 'Personas Morales con Fines no Lucrativos' },
  { clave: '605', nombre: 'Sueldos y salarios' },
  { clave: '606', nombre: 'Arrendamiento' },
  { clave: '612', nombre: 'Actividades empresariales y profesionales' },
  { clave: '616', nombre: 'Sin obligaciones fiscales' },
  { clave: '621', nombre: 'Incorporación fiscal' },
  { clave: '626', nombre: 'Régimen Simplificado de Confianza' },
];

/** Catálogo del SAT: uso del CFDI (los más comunes en mostrador). */
export const USOS_CFDI = [
  { clave: 'G01', nombre: 'Adquisición de mercancías' },
  { clave: 'G03', nombre: 'Gastos en general' },
  { clave: 'I04', nombre: 'Equipo de cómputo y accesorios' },
  { clave: 'S01', nombre: 'Sin efectos fiscales' },
];

export const PUBLICO_GENERAL: Cliente = { id: 'publico', nombre: 'Público general' };

export const CLIENTES: Cliente[] = [
  { id: 'c-001', nombre: 'María Hernández', telefono: '55 1234 5678', correo: 'maria.hdz@gmail.com', estado: { texto: '1 en taller', tono: 'info' },
    desde: '2025-03-05T11:00:00', portal: { tipo: 'personalizada', fecha: '2026-10-04T18:20:00' },
    // Datos fiscales de Figma C2.18.
    fiscal: { rfc: 'HEMM850312QX4', codigoPostal: '06700', razonSocial: 'MARÍA HERNÁNDEZ MORALES', regimen: '605', usoCfdi: 'S01', correo: 'maria.hernandez@correo.mx' },
    // Domicilio de Figma C5.1.
    direccion: { pais: 'México', estado: 'Coahuila', ciudad: 'Torreón', cp: '27000', calle: 'Av. Morelos', exterior: '456', interior: '3' } },
  { id: 'c-002', nombre: 'Mario Ramírez', telefono: '55 4567 1234', correo: 'mario.rmz@hotmail.com' },
  { id: 'c-003', nombre: 'Martha Treviño', telefono: '87 1122 3344', correo: 'mtrevino@gmail.com', estado: { texto: '1 listo', tono: 'exito' } },
  { id: 'c-004', nombre: 'Laura Medina', telefono: '87 1987 6543', correo: 'laura.medina@gmail.com', estado: { texto: '1 listo', tono: 'exito' } },
  { id: 'c-005', nombre: 'Raúl Ortiz', telefono: '87 1555 0102', correo: 'raul.ortiz@outlook.com' },
  { id: 'c-006', nombre: 'Andrés Vega', telefono: '55 3344 9900', correo: 'andres.vega@gmail.com', estado: { texto: '1 en taller', tono: 'info' } },
  { id: 'c-007', nombre: 'Paola Cruz', telefono: '87 1777 2233', correo: 'paola.cruz@gmail.com', estado: { texto: '1 en taller', tono: 'info' } },
  { id: 'c-008', nombre: 'Pedro Núñez', telefono: '87 1444 8811', estado: { texto: '1 listo', tono: 'exito' } },
];

/** Motivos de descuento (C2.6). */
export const MOTIVOS_DESCUENTO = ['Cliente frecuente', 'Producto con detalle', 'Promoción vigente', 'Ajuste de precio', 'Otro'];
