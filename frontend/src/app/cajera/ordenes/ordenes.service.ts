import { Injectable, computed, signal } from '@angular/core';
import { redondear } from '../punto-de-venta/venta.service';

export type EstadoOrden =
  | 'por-cotizar'
  | 'por-aprobar'
  | 'adicional'
  | 'en-taller'
  | 'esperando-refaccion'
  | 'en-garantia'
  | 'lista'
  | 'sin-reparacion'
  | 'vencida'
  | 'bodega'
  | 'garantia-lista'
  | 'terminada'
  | 'sin-reparar-entregada';

export type Filtro = 'todas' | 'por-cotizar' | 'por-aprobar' | 'adicional' | 'en-taller' | 'listas' | 'garantia' | 'bodega';

export interface Tecnico {
  iniciales: string;
  nombre: string;
}

export interface Evento {
  /** ISO */
  fecha: string;
  texto: string;
}

export interface Presupuesto {
  /** ISO */
  enviado: string;
  descripcion: string;
  refacciones: number;
  manoObra: number;
  /** IVA incluido */
  total: number;
  /** ISO de la aprobación (si ya se aprobó). */
  aprobado?: string;
}

export interface Adicional {
  enviado: string;
  descripcion: string;
  /** IVA incluido */
  monto: number;
}

export interface Orden {
  folio: string;
  /** ISO */
  recibido: string;
  cliente: { nombre: string; telefono: string; correo?: string };
  equipo: string;
  imei: string;
  tecnico: Tecnico;
  estado: EstadoOrden;
  trabajo: string;
  presupuesto?: Presupuesto;
  adicional?: Adicional;
  anticipo: number;
  /** Cómo pagó el anticipo (efectivo, tarjeta o transferencia): lo usa el corte de caja (C10). */
  metodoAnticipo?: string;
  /** ISO: cuándo se avisó "Listo". */
  listaDesde?: string;
  /** `pagado` es lo que costó en total; `cobrado` y `metodo`, lo que entró a la caja al entregar (C10). */
  entrega?: { fecha: string; por: string; pagado: number; recogio?: string; cobrado?: number; metodo?: string };
  /** Accesorios que dejó el cliente al recibir (se devuelven en C6). */
  accesorios?: string;
  /** Lo que hizo el técnico (C6 "Trabajo realizado"). */
  realizado?: string;
  /** ISO: cuándo rechazó el presupuesto (C6.2). */
  rechazo?: string;
  /** Reingreso en garantía (C4.5 → C6.3). */
  garantia?: { recibida: string; falla: string; dictamen: string; resolucion: string };
  bodega?: { ubicacion: string; estante: string; enviado: string; por: string };
  historial: Evento[];
  /** Avisos y recordatorios al cliente (C4.6 "Intentos de contacto"). */
  contactos: Evento[];
}

/** Técnico de una orden recién recibida: la asigna el jefe de taller (C5.3). */
export const POR_ASIGNAR: Tecnico = { iniciales: '—', nombre: 'Por asignar (jefe de taller)' };

/** Datos que captura la recepción de taller (C5.1). */
export interface NuevaOrden {
  cliente: { nombre: string; telefono: string; correo?: string };
  tipo: string;
  marca: string;
  modelo: string;
  color: string;
  imei: string;
  accesorios: string;
  falla: string;
  condicion: string;
  anticipo: number;
  metodoAnticipo: string;
}

export const TECNICOS: Tecnico[] = [
  { iniciales: 'CR', nombre: 'Carlos Ruiz' },
  { iniciales: 'MV', nombre: 'Mariana Vega' },
  { iniciales: 'LO', nombre: 'Luis Ortega' },
];

/** Días para recoger antes de pasar a bodega y días de garantía (reglas de Figma C4). */
export const DIAS_PARA_RECOGER = 30;
export const DIAS_GARANTIA = 30;

export const ESTADOS_ORDEN: Record<EstadoOrden, { texto: string; tono: string; paso: number }> = {
  'por-cotizar': { texto: 'Por cotizar', tono: 'neutro', paso: 2 },
  'por-aprobar': { texto: 'Por aprobar', tono: 'advertencia', paso: 3 },
  adicional: { texto: 'Cargo adicional', tono: 'advertencia', paso: 4 },
  'en-taller': { texto: 'En taller', tono: 'info', paso: 4 },
  'esperando-refaccion': { texto: 'Esperando refacción', tono: 'neutro', paso: 4 },
  'en-garantia': { texto: 'En garantía', tono: 'info', paso: 4 },
  lista: { texto: 'Lista', tono: 'exito', paso: 5 },
  'sin-reparacion': { texto: 'Sin reparación', tono: 'peligro', paso: 5 },
  vencida: { texto: 'Vencido · por enviar', tono: 'peligro', paso: 5 },
  bodega: { texto: 'En bodega', tono: 'peligro', paso: 5 },
  'garantia-lista': { texto: 'Garantía lista', tono: 'neutro', paso: 5 },
  terminada: { texto: 'Terminado', tono: 'info', paso: 7 },
  'sin-reparar-entregada': { texto: 'Entregado sin reparar', tono: 'neutro', paso: 7 },
};

/** Estados que se entregan en C6 (en este orden aparecen las tarjetas). */
export const ENTREGABLES: EstadoOrden[] = ['lista', 'garantia-lista', 'sin-reparacion', 'vencida', 'bodega'];

export const FILTROS: { id: Filtro; texto: string; estados: EstadoOrden[] }[] = [
  { id: 'todas', texto: 'Todas', estados: [] },
  { id: 'por-cotizar', texto: 'Por cotizar', estados: ['por-cotizar'] },
  { id: 'por-aprobar', texto: 'Por aprobar', estados: ['por-aprobar'] },
  { id: 'adicional', texto: 'Adicional', estados: ['adicional'] },
  { id: 'en-taller', texto: 'En taller', estados: ['en-taller', 'esperando-refaccion', 'en-garantia'] },
  { id: 'listas', texto: 'Listas', estados: ['lista', 'sin-reparacion', 'garantia-lista'] },
  { id: 'garantia', texto: 'Garantía', estados: ['terminada', 'en-garantia', 'garantia-lista'] },
  { id: 'bodega', texto: 'Bodega', estados: ['vencida', 'bodega'] },
];

const DIA = 86_400_000;
export const diasDesde = (iso: string, hasta = Date.now()) => Math.max(0, Math.floor((hasta - new Date(iso).getTime()) / DIA));
export const sumarDias = (iso: string, dias: number) => new Date(new Date(iso).getTime() + dias * DIA).toISOString();

/** Días de garantía que le quedan a una orden entregada (0 si ya venció). */
export function garantiaRestante(orden: Orden): number {
  if (!orden.entrega || orden.estado === 'sin-reparar-entregada') return 0;
  return Math.max(0, DIAS_GARANTIA - diasDesde(orden.entrega.fecha));
}

/** Etiqueta de estado de la tabla: "Terminado · garantía" mientras la garantía sigue vigente (Figma C4.1). */
export function etiquetaEstado(orden: Orden): string {
  if (orden.estado === 'terminada' && garantiaRestante(orden) > 0) return 'Terminado · garantía';
  return ESTADOS_ORDEN[orden.estado].texto;
}

/** Lo que falta por cobrar al entregar: presupuesto (y adicional aprobado) menos anticipo. */
export function saldo(orden: Orden): number {
  if (['sin-reparacion', 'garantia-lista', 'sin-reparar-entregada'].includes(orden.estado) || !orden.presupuesto) return 0;
  return Math.max(0, redondear(orden.presupuesto.total - orden.anticipo));
}

// ---------- Datos de prueba (Figma C4.1–C4.8) ----------

function hace(dias: number, hora = '10:00'): string {
  const fecha = new Date(Date.now() - dias * DIA);
  const [h, m] = hora.split(':').map(Number);
  fecha.setHours(h, m, 0, 0);
  return (fecha.getTime() > Date.now() ? new Date(Date.now() - 30 * 60_000) : fecha).toISOString();
}

const tecnico = (iniciales: string) => TECNICOS.find((t) => t.iniciales === iniciales)!;
const ev = (dias: number, hora: string, texto: string): Evento => ({ fecha: hace(dias, hora), texto });

function ordenesDemo(): Orden[] {
  const base = { anticipo: 0, contactos: [] as Evento[] };
  return [
    {
      ...base,
      folio: '#1043',
      recibido: hace(0, '09:30'),
      cliente: { nombre: 'Jorge Salinas', telefono: '55 1200 3344', correo: 'jorge.salinas@gmail.com' },
      equipo: 'iPhone 14',
      imei: '356789104512345',
      tecnico: tecnico('CR'),
      estado: 'por-cotizar',
      trabajo: 'No carga; revisar centro de carga',
      historial: [ev(0, '09:30', 'Recibido por Ana Martínez')],
    },
    {
      ...base,
      folio: '#1035',
      recibido: hace(11, '11:20'),
      cliente: { nombre: 'Luis Méndez', telefono: '55 8765 4321', correo: 'luis.mendez@gmail.com' },
      equipo: 'iPhone 12',
      imei: '353912110987654',
      tecnico: tecnico('CR'),
      estado: 'por-aprobar',
      trabajo: 'Reemplazo de pantalla completa',
      presupuesto: {
        enviado: hace(4, '09:40'),
        descripcion: 'Pantalla rota y táctil sin respuesta. Reemplazo del módulo completo.',
        refacciones: 700,
        manoObra: 291.38,
        total: 1150,
      },
      anticipo: 300,
      historial: [
        ev(11, '11:20', 'Recibido por Ana Martínez'),
        ev(10, '10:05', 'Diagnóstico terminado (CR)'),
        ev(4, '09:40', 'Presupuesto enviado al portal'),
        ev(4, '11:15', 'El cliente abrió el presupuesto'),
      ],
    },
    {
      ...base,
      folio: '#1029',
      recibido: hace(11, '10:30'),
      cliente: { nombre: 'Andrés Vega', telefono: '55 4411 2299', correo: 'andres.vega@gmail.com' },
      equipo: 'Samsung S21',
      imei: '354021118765432',
      tecnico: tecnico('CR'),
      estado: 'adicional',
      trabajo: 'Cambio de pantalla',
      presupuesto: { enviado: hace(11, '15:00'), descripcion: 'Cambio de pantalla AMOLED.', refacciones: 750, manoObra: 267.24, total: 1180, aprobado: hace(11, '16:10') },
      adicional: { enviado: hace(0, '11:30'), descripcion: 'Flex de cámara frontal roto; la cámara no enciende. Lo autorizado sigue en curso.', monto: 530 },
      historial: [
        ev(11, '10:30', 'Recibido por Ana Martínez'),
        ev(11, '16:10', 'Cliente aprobó $1,180.00'),
        ev(0, '11:20', 'Carlos reportó daño adicional'),
        ev(0, '11:30', 'Re-cotización enviada al portal'),
      ],
    },
    {
      ...base,
      folio: '#1028',
      recibido: hace(3, '12:10'),
      cliente: { nombre: 'Valeria Mora', telefono: '55 6655 1188' },
      equipo: 'iPhone 11',
      imei: '352001117654321',
      tecnico: tecnico('MV'),
      estado: 'esperando-refaccion',
      trabajo: 'Cambio de batería',
      presupuesto: { enviado: hace(3, '16:00'), descripcion: 'Batería al 71 %. Cambio de batería.', refacciones: 420, manoObra: 140.34, total: 650, aprobado: hace(2, '09:15') },
      historial: [ev(3, '12:10', 'Recibido por Ana Martínez'), ev(2, '09:15', 'Presupuesto aprobado en el portal'), ev(1, '13:00', 'Refacción pedida al proveedor')],
    },
    {
      ...base,
      // Figma C8: el equipo en taller de María Hernández.
      folio: '#1024',
      recibido: hace(3, '10:40'),
      cliente: { nombre: 'María Hernández', telefono: '55 1234 5678', correo: 'maria.hdz@gmail.com' },
      equipo: 'Samsung S22 Ultra',
      imei: '359876221054321',
      tecnico: tecnico('LO'),
      estado: 'en-taller',
      trabajo: 'Puerto USB-C y flex de carga',
      presupuesto: { enviado: hace(3, '15:30'), descripcion: 'No carga: puerto USB-C dañado y flex de carga con falso contacto.', refacciones: 928, manoObra: 372, total: 1508, aprobado: hace(2, '10:05') },
      anticipo: 500,
      historial: [ev(3, '10:40', 'Recibido por Ana Martínez'), ev(2, '10:05', 'Presupuesto aprobado en el portal'), ev(1, '12:00', 'En reparación (LO)')],
    },
    {
      ...base,
      folio: '#1026',
      recibido: hace(10, '10:00'),
      cliente: { nombre: 'Laura Medina', telefono: '55 2233 4455', correo: 'laura.medina@gmail.com' },
      equipo: 'iPhone 11',
      imei: '352001110001122',
      tecnico: tecnico('CR'),
      estado: 'lista',
      trabajo: 'Batería y limpieza de puerto',
      accesorios: 'Funda transparente',
      realizado: 'Cambio de batería. Pruebas de carga rápida (25 W) y de pantalla correctas.',
      presupuesto: { enviado: hace(10, '16:00'), descripcion: 'Batería y limpieza de puerto.', refacciones: 520, manoObra: 247.24, total: 890, aprobado: hace(9, '11:00') },
      listaDesde: hace(4, '17:45'),
      historial: [
        ev(10, '10:00', 'Recibido por Ana Martínez'),
        ev(9, '11:00', 'Presupuesto aprobado en el portal'),
        ev(4, '17:30', 'Reparación terminada (CR)'),
        ev(4, '17:45', 'Aviso de “Listo” en el portal'),
      ],
    },
    {
      ...base,
      folio: '#1021',
      recibido: hace(9, '11:30'),
      cliente: { nombre: 'Pedro Núñez', telefono: '55 3344 5566', correo: 'pedro.nunez@gmail.com' },
      equipo: 'Redmi 12C',
      imei: '861122334455667',
      tecnico: tecnico('CR'),
      estado: 'lista',
      trabajo: 'Limpieza por humedad',
      accesorios: 'Ninguno',
      realizado: 'Limpieza por humedad de carga. Pruebas de carga y autonomía correctas.',
      presupuesto: { enviado: hace(9, '16:00'), descripcion: 'Limpieza por humedad.', refacciones: 600, manoObra: 425.86, total: 1190, aprobado: hace(8, '10:00') },
      anticipo: 300,
      listaDesde: hace(5, '17:45'),
      historial: [ev(9, '11:30', 'Recibido por Ana Martínez'), ev(8, '10:00', 'Presupuesto aprobado en el portal'), ev(5, '17:45', 'Aviso de “Listo” en el portal')],
    },
    {
      ...base,
      folio: '#0991',
      recibido: hace(25, '10:00'),
      cliente: { nombre: 'Paola Cruz', telefono: '87 1777 2233', correo: 'paola.cruz@gmail.com' },
      equipo: 'iPhone 13',
      imei: '353300112233445',
      tecnico: tecnico('MV'),
      estado: 'garantia-lista',
      trabajo: 'Cambio de pantalla',
      accesorios: 'Ninguno',
      presupuesto: { enviado: hace(24, '12:00'), descripcion: 'Cambio de pantalla.', refacciones: 1300, manoObra: 424.14, total: 2000, aprobado: hace(24, '15:00') },
      listaDesde: hace(1, '16:30'),
      entrega: { fecha: hace(20, '12:00'), por: 'Ana Martínez · Caja 01', pagado: 2000 },
      garantia: {
        recibida: hace(4, '11:00'),
        falla: 'La pantalla parpadea en la parte inferior',
        dictamen: 'Cubierta por garantía',
        resolucion: 'Se reemplazó el flex de pantalla sin costo; la falla está relacionada con la reparación original.',
      },
      historial: [ev(25, '10:00', 'Recibido'), ev(20, '12:00', 'Entregado y pagado'), ev(4, '11:00', 'Recibido en garantía'), ev(1, '16:30', 'Garantía terminada (MV)')],
    },
    {
      ...base,
      folio: '#0998',
      recibido: hace(18, '10:00'),
      cliente: { nombre: 'Raúl Ortiz', telefono: '55 9988 7766', correo: 'raul.ortiz@outlook.com' },
      equipo: 'Motorola G84',
      imei: '359876543210987',
      tecnico: tecnico('MV'),
      estado: 'terminada',
      trabajo: 'Cambio de pantalla OLED',
      presupuesto: { enviado: hace(17, '12:00'), descripcion: 'Cambio de pantalla OLED.', refacciones: 760, manoObra: 240, total: 1160, aprobado: hace(17, '18:00') },
      listaDesde: hace(11, '18:00'),
      entrega: { fecha: hace(10, '12:30'), por: 'Ana Martínez · Caja 01', pagado: 1160 },
      historial: [
        ev(18, '10:00', 'Recibido'),
        ev(17, '12:00', 'Diagnóstico y presupuesto'),
        ev(17, '18:00', 'Aprobado por el cliente en el portal'),
        ev(11, '18:00', 'Reparación terminada'),
        ev(10, '12:30', 'Entregado y pagado'),
      ],
    },
    {
      ...base,
      folio: '#1037',
      recibido: hace(2, '13:00'),
      cliente: { nombre: 'Fernanda Ríos', telefono: '55 7788 9900' },
      equipo: 'Huawei P30',
      imei: '861234567890123',
      tecnico: tecnico('LO'),
      estado: 'sin-reparacion',
      trabajo: 'Sin reparación · placa dañada',
      accesorios: 'Ninguno',
      realizado: 'El equipo se devuelve sin reparar y en las mismas condiciones registradas en la orden: placa dañada por humedad. Solo se cobró la revisión.',
      anticipo: 200,
      listaDesde: hace(1, '12:00'),
      historial: [ev(2, '13:00', 'Recibido por Ana Martínez'), ev(1, '11:40', 'Diagnóstico: placa dañada, no tiene reparación'), ev(1, '12:00', 'Aviso para recoger en el portal')],
    },
    {
      ...base,
      folio: '#0961',
      recibido: hace(45, '10:00'),
      cliente: { nombre: 'Ricardo Gil', telefono: '55 3322 1100' },
      equipo: 'Galaxy A12',
      imei: '354444333222111',
      tecnico: tecnico('LO'),
      estado: 'vencida',
      trabajo: 'Cambio de centro de carga',
      presupuesto: { enviado: hace(44, '12:00'), descripcion: 'Cambio de centro de carga.', refacciones: 240, manoObra: 122.07, total: 420, aprobado: hace(43, '10:00') },
      listaDesde: hace(36, '17:00'),
      historial: [ev(45, '10:00', 'Recibido'), ev(36, '17:00', 'Aviso de “Listo” en el portal')],
      contactos: [ev(36, '17:00', 'Aviso de “Listo” en el portal'), ev(29, '10:00', 'Recordatorio en el portal (sin respuesta)')],
    },
    {
      ...base,
      folio: '#0957',
      recibido: hace(38, '10:00'),
      cliente: { nombre: 'Daniel Ochoa', telefono: '55 1010 2020' },
      equipo: 'Redmi 10',
      imei: '869999888777666',
      tecnico: tecnico('CR'),
      estado: 'vencida',
      trabajo: 'Cambio de pantalla',
      presupuesto: { enviado: hace(37, '12:00'), descripcion: 'Cambio de pantalla.', refacciones: 220, manoObra: 107.59, total: 380, aprobado: hace(37, '15:00') },
      listaDesde: hace(31, '17:00'),
      historial: [ev(38, '10:00', 'Recibido'), ev(31, '17:00', 'Aviso de “Listo” en el portal')],
      contactos: [ev(31, '17:00', 'Aviso de “Listo” en el portal')],
    },
    {
      ...base,
      folio: '#0963',
      recibido: hace(35, '10:00'),
      cliente: { nombre: 'Mónica Paz', telefono: '55 4545 6767', correo: 'monica.paz@gmail.com' },
      equipo: 'iPhone 11',
      imei: '352001119998887',
      tecnico: tecnico('MV'),
      estado: 'vencida',
      trabajo: 'Cambio de batería y cámara',
      presupuesto: { enviado: hace(34, '12:00'), descripcion: 'Batería y cámara trasera.', refacciones: 330, manoObra: 135.52, total: 540, aprobado: hace(34, '18:00') },
      listaDesde: hace(30, '17:00'),
      historial: [ev(35, '10:00', 'Recibido'), ev(30, '17:00', 'Aviso de “Listo” en el portal')],
      contactos: [ev(30, '17:00', 'Aviso de “Listo” en el portal')],
    },
    {
      ...base,
      folio: '#0954',
      recibido: hace(65, '10:00'),
      cliente: { nombre: 'Sergio Lara', telefono: '55 3311 2200', correo: 'sergio.lara@gmail.com' },
      equipo: 'iPad 9',
      imei: '358888777666555',
      tecnico: tecnico('CR'),
      estado: 'bodega',
      trabajo: 'Sin reparación · placa dañada',
      listaDesde: hace(44, '17:00'),
      bodega: { ubicacion: 'Bodega trasera', estante: 'B-3', enviado: hace(3, '10:00'), por: 'Ana Martínez' },
      historial: [ev(65, '10:00', 'Recibido'), ev(44, '17:00', 'Diagnóstico: sin reparación'), ev(3, '10:00', 'Enviado a bodega (B-3)')],
      contactos: [
        ev(44, '17:00', 'Aviso de “Listo” en el portal'),
        ev(37, '10:00', 'Recordatorio en el portal (sin respuesta)'),
        ev(23, '10:00', 'Segundo recordatorio en el portal'),
        ev(3, '10:00', 'Aviso de envío a bodega'),
      ],
    },
    {
      ...base,
      folio: '#0948',
      recibido: hace(60, '10:00'),
      cliente: { nombre: 'Óscar Medina', telefono: '55 2121 3434' },
      equipo: 'Galaxy A32',
      imei: '354545454545454',
      tecnico: tecnico('CR'),
      estado: 'bodega',
      trabajo: 'Cambio de batería',
      presupuesto: { enviado: hace(59, '12:00'), descripcion: 'Cambio de batería.', refacciones: 300, manoObra: 131.03, total: 500, aprobado: hace(59, '16:00') },
      anticipo: 200,
      listaDesde: hace(48, '17:00'),
      bodega: { ubicacion: 'Bodega trasera', estante: 'B-1', enviado: hace(17, '10:00'), por: 'Ana Martínez' },
      historial: [ev(60, '10:00', 'Recibido'), ev(48, '17:00', 'Aviso de “Listo” en el portal'), ev(17, '10:00', 'Enviado a bodega (B-1)')],
      contactos: [ev(48, '17:00', 'Aviso de “Listo” en el portal'), ev(17, '10:00', 'Aviso de envío a bodega'), ev(2, '10:00', 'Recordatorio por correo')],
    },
    {
      ...base,
      folio: '#0939',
      recibido: hace(70, '10:00'),
      cliente: { nombre: 'Rosa Núñez', telefono: '55 9090 8080', correo: 'rosa.nunez@gmail.com' },
      equipo: 'iPhone XR',
      imei: '356565656565656',
      tecnico: tecnico('MV'),
      estado: 'bodega',
      trabajo: 'Cambio de pantalla',
      presupuesto: { enviado: hace(69, '12:00'), descripcion: 'Cambio de pantalla.', refacciones: 900, manoObra: 307.76, total: 1400, aprobado: hace(69, '18:00') },
      anticipo: 400,
      listaDesde: hace(57, '17:00'),
      bodega: { ubicacion: 'Bodega trasera', estante: 'B-2', enviado: hace(26, '10:00'), por: 'Ana Martínez' },
      historial: [ev(70, '10:00', 'Recibido'), ev(57, '17:00', 'Aviso de “Listo” en el portal'), ev(26, '10:00', 'Enviado a bodega (B-2)')],
      contactos: [ev(57, '17:00', 'Aviso de “Listo” en el portal'), ev(26, '10:00', 'Aviso de envío a bodega'), ev(4, '10:00', 'Recordatorio en el portal')],
    },
  ];
}

const ahoraIso = () => new Date().toISOString();

/**
 * Órdenes de servicio (C4). Simulado: datos de prueba en memoria.
 * Al conectar la API, las respuestas, garantías y envíos a bodega irán al servidor y al portal del cliente.
 */
@Injectable({ providedIn: 'root' })
export class OrdenesService {
  readonly ordenes = signal<Orden[]>(ordenesDemo());

  /** Folio que tendrá la siguiente orden (C5.1 "Nueva orden #1044"). */
  readonly siguienteFolio = computed(() => {
    const mayor = this.ordenes().reduce((max, o) => Math.max(max, Number(o.folio.replace(/[^0-9]/g, ''))), 0);
    return `#${String(mayor + 1).padStart(4, '0')}`;
  });

  /** Listas que ya pasaron 30 días sin recoger y siguen en el mostrador (C4.7). */
  readonly vencidas = computed(() => this.ordenes().filter((o) => o.estado === 'vencida'));

  /** C5.1: registra la orden recibida en mostrador. Queda "Por cotizar" hasta que el jefe de taller la asigne. */
  crear(datos: NuevaOrden, cajera: string): Orden {
    const ahora = ahoraIso();
    const historial: Evento[] = [{ fecha: ahora, texto: `Recibido por ${cajera}` }];
    if (datos.anticipo > 0) historial.push({ fecha: ahora, texto: `Anticipo de $${datos.anticipo.toFixed(2)} en ${datos.metodoAnticipo.toLowerCase()}` });
    const orden: Orden = {
      folio: this.siguienteFolio(),
      recibido: ahora,
      cliente: datos.cliente,
      equipo: `${datos.marca === 'Apple' ? '' : datos.marca} ${datos.modelo}`.trim() || datos.tipo,
      imei: datos.imei.replace(/ /g, ''),
      tecnico: POR_ASIGNAR,
      estado: 'por-cotizar',
      trabajo: datos.falla.trim(),
      accesorios: datos.accesorios || 'Ninguno',
      anticipo: datos.anticipo,
      metodoAnticipo: datos.anticipo > 0 ? datos.metodoAnticipo.toLowerCase() : undefined,
      historial,
      contactos: datos.cliente.correo ? [{ fecha: ahora, texto: 'Acceso al portal enviado por correo' }] : [],
    };
    this.ordenes.update((lista) => [orden, ...lista]);
    return orden;
  }

  /** C4.2 / C4.8: respuesta del cliente registrada en mostrador. */
  registrarRespuesta(folio: string, aprobo: boolean, nota: string, cajera: string): void {
    this.actualizar(folio, (o) => {
      const sufijo = nota.trim() ? ` · “${nota.trim()}”` : '';
      if (o.estado === 'adicional' && o.adicional && o.presupuesto) {
        const presupuesto = aprobo ? { ...o.presupuesto, total: redondear(o.presupuesto.total + o.adicional.monto) } : o.presupuesto;
        return {
          ...o,
          estado: 'en-taller',
          presupuesto,
          adicional: undefined,
          historial: [...o.historial, { fecha: ahoraIso(), texto: `Adicional ${aprobo ? 'aprobado' : 'rechazado'} en sucursal por ${cajera}${sufijo}` }],
        };
      }
      return {
        ...o,
        estado: aprobo ? 'en-taller' : 'sin-reparacion',
        rechazo: aprobo ? o.rechazo : ahoraIso(),
        presupuesto: o.presupuesto && aprobo ? { ...o.presupuesto, aprobado: ahoraIso() } : o.presupuesto,
        listaDesde: aprobo ? o.listaDesde : ahoraIso(),
        trabajo: aprobo ? o.trabajo : 'Sin reparación · el cliente no aprobó',
        historial: [...o.historial, { fecha: ahoraIso(), texto: `${aprobo ? 'Aprobado' : 'Rechazado'} en sucursal por ${cajera}${sufijo}` }],
      };
    });
  }

  /** C4.5: el equipo vuelve al taller con el mismo folio. */
  recibirGarantia(folio: string, falla: string, tecnicoAsignado: Tecnico, cajera: string): void {
    this.actualizar(folio, (o) => ({
      ...o,
      estado: 'en-garantia',
      tecnico: tecnicoAsignado,
      garantia: { recibida: ahoraIso(), falla: falla.trim(), dictamen: 'En revisión', resolucion: '' },
      historial: [...o.historial, { fecha: ahoraIso(), texto: `Recibido en garantía por ${cajera}: ${falla.trim()}` }],
    }));
  }

  /** C4.7 */
  enviarABodega(folios: string[], ubicacion: string, estante: string, avisar: boolean, cajera: string): void {
    const ahora = ahoraIso();
    this.ordenes.update((lista) =>
      lista.map((o): Orden =>
        folios.includes(o.folio)
          ? {
              ...o,
              estado: 'bodega',
              bodega: { ubicacion, estante, enviado: ahora, por: cajera },
              historial: [...o.historial, { fecha: ahora, texto: `Enviado a bodega (${ubicacion} · ${estante})` }],
              contactos: avisar ? [...o.contactos, { fecha: ahora, texto: 'Aviso de envío a bodega' }] : o.contactos,
            }
          : o,
      ),
    );
  }

  /**
   * C6: entrega el equipo. Normal → "Terminado" con garantía desde hoy; sin reparar → "Entregado sin reparar";
   * tras garantía → vuelve a "Terminado" sin reiniciar la garantía original.
   */
  entregar(folio: string, entrega: { recoge: string; pagado: number; metodo: string; cajera: string }): Orden | undefined {
    const ahora = ahoraIso();
    const por = `${entrega.cajera} · Caja 01`;
    this.actualizar(folio, (o): Orden => {
      const evento = (texto: string) => [...o.historial, { fecha: ahora, texto }];
      const contactos = [...o.contactos, { fecha: ahora, texto: 'Aviso de entrega en el portal' }];
      const pago = entrega.pagado > 0 ? ` · cobrados $${entrega.pagado.toFixed(2)} en ${entrega.metodo.toLowerCase()}` : '';
      if (o.estado === 'garantia-lista') {
        return { ...o, estado: 'terminada', historial: evento(`Entregado tras garantía a ${entrega.recoge}`), contactos };
      }
      if (o.estado === 'sin-reparacion') {
        return {
          ...o,
          estado: 'sin-reparar-entregada',
          entrega: { fecha: ahora, por, pagado: o.anticipo, recogio: entrega.recoge, cobrado: 0 },
          historial: evento(`Entregado sin reparar a ${entrega.recoge}`),
          contactos,
        };
      }
      const desdeBodega = o.estado === 'bodega' ? 'Sacado de bodega y entregado' : 'Entregado';
      return {
        ...o,
        estado: 'terminada',
        bodega: undefined,
        entrega: { fecha: ahora, por, pagado: o.presupuesto?.total ?? o.anticipo + entrega.pagado, recogio: entrega.recoge, cobrado: entrega.pagado, metodo: entrega.metodo },
        historial: evento(`${desdeBodega} a ${entrega.recoge}${pago}`),
        contactos,
      };
    });
    return this.ordenes().find((o) => o.folio === folio);
  }

  /** C7.5 · Llegó la refacción de un pedido del jefe: queda apartada y la orden vuelve al taller. */
  refaccionRecibida(folio: string, pieza: string, entrada: string): void {
    const texto = `Llegó ${pieza} (${entrada}); queda apartada para esta orden`;
    this.actualizar(folio, (o) => ({
      ...o,
      estado: o.estado === 'esperando-refaccion' ? 'en-taller' : o.estado,
      historial: [...o.historial, { fecha: ahoraIso(), texto }],
    }));
  }

  /** "Avisar al cliente" / "Enviar recordatorio por correo". */
  avisar(folio: string, texto: string): void {
    this.actualizar(folio, (o) => ({ ...o, contactos: [...o.contactos, { fecha: ahoraIso(), texto }], historial: [...o.historial, { fecha: ahoraIso(), texto }] }));
  }

  private actualizar(folio: string, cambio: (orden: Orden) => Orden): void {
    this.ordenes.update((lista) => lista.map((o) => (o.folio === folio ? cambio(o) : o)));
  }
}
