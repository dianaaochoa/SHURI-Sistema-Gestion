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
  /** Para recomendar a quién asignar (J2.2). */
  especialidad?: string;
}

export type Prioridad = 'normal' | 'alta' | 'urgente';
export const PRIORIDADES: Record<Prioridad, { texto: string; tono: string }> = {
  normal: { texto: 'Normal', tono: 'neutro' },
  alta: { texto: 'Alta', tono: 'advertencia' },
  urgente: { texto: 'Urgente', tono: 'peligro' },
};

export interface Evento {
  /** ISO */
  fecha: string;
  texto: string;
}

/** Renglón de un presupuesto (J3): refacción del inventario, mano de obra o concepto escrito a mano. */
export interface Concepto {
  tipo: 'refaccion' | 'mano-obra' | 'otro';
  descripcion: string;
  sku?: string;
  cantidad: number;
  /** Costo unitario interno, sin IVA (0 en mano de obra). Solo lo ve el taller. */
  costo: number;
  /** Precio unitario al cliente, IVA incluido. */
  precio: number;
  /** "1 h 30 min · nivel medio" */
  detalle?: string;
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
  /** Lo que armó el jefe en J3.2. */
  conceptos?: Concepto[];
  descuento?: number;
  vigenciaDias?: number;
}

/** Importe al cliente de una lista de conceptos (IVA incluido). */
export const importeConceptos = (lista: Concepto[]) => redondear(lista.reduce((s, c) => s + c.cantidad * c.precio, 0));

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
  /** Reingreso en garantía (C4.5 → J4 → C6.3). Sin `recibio` = la pidió el cliente desde el portal. */
  garantia?: { recibida: string; falla: string; dictamen: string; resolucion: string; condicion?: string; recibio?: string; reporte?: ReporteGarantia; decision?: DecisionGarantia };
  /** Lo que se capturó en la recepción (C5.1); lo usan la orden impresa y sus comprobantes (C11). */
  ficha?: FichaRecepcion;
  /** Lo define el jefe al asignar (J2.2); sin valor = normal. */
  prioridad?: Prioridad;
  /** ISO: fecha prometida al cliente (J2.2). */
  prometida?: string;
  /** El técnico envió su diagnóstico: la orden pasa de "Diagnóstico" a "Por cotizar" en el tablero (J2) y el jefe la cotiza (J3.2). */
  diagnostico?: { fecha: string; texto: string; resumen?: string; causa?: string; dificultad?: string; nota?: string; conceptos?: Concepto[] };
  /** El técnico reporta que no tiene reparación; el jefe lo confirma (J3.3). */
  sinReparacion?: { fecha: string; motivo: string; texto: string };
  /** Daño encontrado durante la reparación; el jefe lo re-cotiza (J3.4). */
  danoAdicional?: { fecha: string; texto: string; urgente: boolean; conceptos: Concepto[] };
  /** Cobro de revisión de un equipo sin reparación (J3.3). Sin valor: la revisión es el anticipo. */
  revision?: { cobrar: boolean; monto: number };
  /** Orden en pausa (J2.3): desde cuándo y por qué. */
  pausa?: { desde: string; motivo: string; detalle: string };
  /** Notas internas del taller (no las ve el cliente). */
  notas?: Evento[];
  bodega?: { ubicacion: string; estante: string; enviado: string; por: string };
  historial: Evento[];
  /** Avisos y recordatorios al cliente (C4.6 "Intentos de contacto"). */
  contactos: Evento[];
}

/** Lo que encontró el técnico al revisar un equipo en garantía (J4.2 "Reporte del técnico"). */
export interface ReporteGarantia {
  fecha: string;
  hallazgo: string;
  /** "No, daño posterior a la entrega" */
  relacion: string;
  malUso: string;
  trabajo: string;
  recomienda: 'aplica' | 'no-aplica';
  /** "humedad posterior", "pieza defectuosa" */
  motivo: string;
  /** Costo sugerido si no aplica (IVA incluido). */
  costo?: number;
}

export type TipoDictamen = 'aplica' | 'con-costo' | 'sin-reparar';

/** Dictamen del jefe (J4.2): se publica en el portal del cliente. */
export interface DecisionGarantia {
  fecha: string;
  tipo: TipoDictamen;
  texto: string;
  concepto?: string;
  costo?: number;
  por: string;
}

export interface FichaRecepcion {
  tipo: string;
  marca: string;
  modelo: string;
  color: string;
  condicion: string;
  /** Cajera que la recibió. */
  recibio: string;
  /** Falla tal como la dijo el cliente (si difiere del trabajo). */
  falla?: string;
  /** Contraseña temporal del portal que se imprimió con la orden. */
  contrasena?: string;
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
  { iniciales: 'CR', nombre: 'Carlos Ruiz', especialidad: 'Samsung' },
  { iniciales: 'MV', nombre: 'Mariana Vega', especialidad: 'microsoldadura' },
  { iniciales: 'LO', nombre: 'Luis Ortega', especialidad: 'iPhone' },
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
  if (orden.estado === 'sin-reparacion' && orden.revision?.cobrar) return Math.max(0, redondear(orden.revision.monto - orden.anticipo));
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
/** Hace `h` horas (para los tiempos cortos del tablero J2). */
const horas = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
/** Fecha prometida de prueba: dentro de `dias` días a las 18:00. */
const prometidaEn = (dias: number) => {
  const fecha = new Date(Date.now() + dias * DIA);
  fecha.setHours(18, 0, 0, 0);
  return fecha.toISOString();
};
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
      // Figma J3.2
      diagnostico: {
        fecha: horas(0.4),
        resumen: 'Conector de batería desprendido; batería inflada',
        texto: 'La placa no recibe carga: conector de batería desprendido por el golpe y batería inflada. Pantalla y cámaras funcionan al alimentar con fuente.',
        causa: 'golpe / caída',
        dificultad: 'media',
        nota: 'Recomiendo cambiar batería; el flex se puede pedir para mañana.',
        conceptos: [
          { tipo: 'refaccion', descripcion: 'Batería iPhone 14', sku: 'REF-IP14-BAT', cantidad: 1, costo: 380, precio: 850 },
          { tipo: 'refaccion', descripcion: 'Conector flex de batería', sku: 'REF-IP14-FLX', cantidad: 1, costo: 180, precio: 400 },
          { tipo: 'mano-obra', descripcion: 'Mano de obra', cantidad: 1, costo: 0, precio: 580, detalle: '1 h 30 min · nivel medio' },
        ],
      },
      anticipo: 300,
      prometida: prometidaEn(1),
      historial: [ev(0, '09:30', 'Recibido por Ana Martínez')],
    },
    {
      ...base,
      // Figma J1.1: recibido sin técnico (lo asigna el jefe).
      folio: '#1041',
      recibido: hace(0, '08:10'),
      cliente: { nombre: 'Gabriela Soto', telefono: '55 2468 1357', correo: 'gaby.soto@gmail.com' },
      equipo: 'iPhone 13',
      imei: '353112131415161',
      tecnico: POR_ASIGNAR,
      estado: 'por-cotizar',
      trabajo: 'Pantalla con líneas verdes',
      historial: [ev(0, '08:10', 'Recibido por Ana Martínez')],
    },
    {
      ...base,
      // Figma J2.1: en diagnóstico.
      folio: '#1040',
      recibido: horas(6),
      cliente: { nombre: 'Diego Ruiz', telefono: '55 1357 2468', correo: 'diego.ruiz@gmail.com' },
      equipo: 'Moto G84',
      imei: '359840001234567',
      tecnico: tecnico('LO'),
      estado: 'por-cotizar',
      trabajo: 'Líneas en pantalla',
      historial: [{ fecha: horas(6), texto: 'Recibido por Ana Martínez' }],
    },
    {
      ...base,
      folio: '#1039',
      recibido: horas(8),
      cliente: { nombre: 'Paula Gómez', telefono: '55 9753 1864', correo: 'paula.gomez@gmail.com' },
      equipo: 'Redmi Note 12',
      imei: '861234567890123',
      tecnico: tecnico('LO'),
      estado: 'por-cotizar',
      trabajo: 'Batería dura poco',
      historial: [{ fecha: horas(8), texto: 'Recibido por Ana Martínez' }],
    },
    {
      ...base,
      // Figma J3.3: el técnico reporta que no tiene reparación; el jefe lo confirma.
      folio: '#1038',
      recibido: hace(1, '16:20'),
      cliente: { nombre: 'Héctor Navarro', telefono: '55 4433 2211', correo: 'hector.navarro@gmail.com' },
      equipo: 'Xiaomi Mi 11 Lite',
      imei: '864512003344556',
      tecnico: tecnico('LO'),
      estado: 'por-cotizar',
      trabajo: 'No enciende',
      anticipo: 300,
      sinReparacion: { fecha: horas(1.5), motivo: 'Daño en placa irreparable', texto: 'La placa tiene un corto en la línea de alimentación del procesador. No hay pieza de reemplazo.' },
      historial: [ev(1, '16:20', 'Recibido por Ana Martínez'), { fecha: horas(1.5), texto: 'Luis reportó: sin reparación' }],
    },
    {
      ...base,
      // Figma J1.1: por cotizar fuera de tiempo (más de 24 h).
      folio: '#1034',
      recibido: hace(1, '07:30'),
      cliente: { nombre: 'Elena Díaz', telefono: '55 7711 2233', correo: 'elena.diaz@gmail.com' },
      equipo: 'Samsung A54',
      imei: '354540001112223',
      tecnico: tecnico('LO'),
      estado: 'por-cotizar',
      trabajo: 'No enciende después de una caída',
      diagnostico: {
        fecha: horas(2),
        resumen: 'Micrófono inferior dañado; flex de carga ok',
        texto: 'Micrófono inferior y conector de placa dañados por el golpe. El flex de carga está bien.',
        causa: 'golpe / caída',
        dificultad: 'baja',
        conceptos: [{ tipo: 'mano-obra', descripcion: 'Mano de obra', cantidad: 1, costo: 0, precio: 350, detalle: '45 min · nivel bajo' }],
      },
      prioridad: 'alta',
      historial: [ev(1, '07:30', 'Recibido por Ana Martínez'), ev(0, '09:00', 'Diagnóstico en curso (LO)')],
    },
    {
      ...base,
      // Figma J4.1: garantía que el técnico recomienda aplicar.
      folio: '#1002',
      recibido: hace(16, '11:00'),
      cliente: { nombre: 'Diego Torres', telefono: '55 3141 5926', correo: 'diego.torres@gmail.com' },
      equipo: 'iPhone 13',
      imei: '353113000222333',
      tecnico: tecnico('CR'),
      estado: 'en-garantia',
      trabajo: 'Puerto de carga',
      presupuesto: { enviado: hace(16, '15:00'), descripcion: 'Cambio de puerto de carga.', refacciones: 420, manoObra: 182.07, total: 698.4, aprobado: hace(16, '17:00') },
      listaDesde: hace(14, '13:00'),
      entrega: { fecha: hace(13, '12:00'), por: 'Ana Martínez · Caja 01', pagado: 698.4 },
      garantia: {
        recibida: hace(1, '12:00'),
        falla: 'Carga solo si muevo el cable.',
        dictamen: 'Carlos recomienda: aplica (pieza defectuosa)',
        resolucion: '',
        recibio: 'Ana Martínez',
        reporte: {
          fecha: hace(0, '09:20'),
          hallazgo: 'Puerto flojo; soldadura del conector fracturada',
          relacion: 'Sí, es la pieza que se cambió',
          malUso: 'Ninguna',
          trabajo: 'Reemplazo del puerto de carga',
          recomienda: 'aplica',
          motivo: 'pieza defectuosa',
        },
      },
      historial: [ev(16, '11:00', 'Recibido'), ev(13, '12:00', 'Entregado y pagado'), ev(1, '12:00', 'Recibido en garantía por Ana Martínez'), ev(0, '09:20', 'Carlos envió su reporte de garantía')],
    },
    {
      ...base,
      // J4.1 "En revisión": el técnico todavía no manda su reporte.
      folio: '#1006',
      recibido: hace(19, '10:30'),
      cliente: { nombre: 'Ricardo Peña', telefono: '55 2718 2818', correo: 'ricardo.pena@gmail.com' },
      equipo: 'Moto G72',
      imei: '359720004445556',
      tecnico: tecnico('LO'),
      estado: 'en-garantia',
      trabajo: 'Cambio de micrófono',
      presupuesto: { enviado: hace(19, '14:00'), descripcion: 'Cambio de micrófono inferior.', refacciones: 180, manoObra: 164.83, total: 400, aprobado: hace(19, '16:00') },
      listaDesde: hace(17, '12:00'),
      entrega: { fecha: hace(16, '13:00'), por: 'Ana Martínez · Caja 01', pagado: 400 },
      garantia: { recibida: horas(3), falla: 'En llamadas no me escuchan bien.', dictamen: 'En revisión', resolucion: '' },
      historial: [ev(19, '10:30', 'Recibido'), ev(16, '13:00', 'Entregado y pagado'), { fecha: horas(3), texto: 'Garantía solicitada desde el portal' }],
    },
    {
      ...base,
      // J4.1 "En reparación": garantía aplicada, el técnico la está reparando.
      folio: '#1010',
      recibido: hace(22, '09:45'),
      cliente: { nombre: 'Andrea Salas', telefono: '55 1618 0339', correo: 'andrea.salas@gmail.com' },
      equipo: 'iPhone 12',
      imei: '353912001234987',
      tecnico: tecnico('MV'),
      estado: 'en-garantia',
      trabajo: 'Cambio de batería',
      presupuesto: { enviado: hace(22, '13:00'), descripcion: 'Cambio de batería.', refacciones: 380, manoObra: 136.21, total: 598.8, aprobado: hace(22, '15:00') },
      listaDesde: hace(20, '12:00'),
      entrega: { fecha: hace(19, '17:00'), por: 'Luis Peña · Caja 01', pagado: 598.8 },
      garantia: {
        recibida: hace(2, '11:00'),
        falla: 'La batería se descarga en medio día.',
        dictamen: 'Cubierta por garantía',
        resolucion: '',
        reporte: { fecha: hace(2, '15:00'), hallazgo: 'Batería con celda defectuosa', relacion: 'Sí, es la batería que se cambió', malUso: 'Ninguna', trabajo: 'Reemplazo de batería', recomienda: 'aplica', motivo: 'pieza defectuosa' },
        decision: { fecha: hace(2, '16:10'), tipo: 'aplica', texto: 'La batería que instalamos salió defectuosa. Se cambia sin costo con el mismo folio.', por: 'Jorge López' },
      },
      historial: [ev(22, '09:45', 'Recibido'), ev(19, '17:00', 'Entregado y pagado'), ev(2, '11:00', 'Garantía solicitada desde el portal'), ev(2, '16:10', 'Garantía aplicada por Jorge López: se repara sin costo')],
    },
    {
      ...base,
      // Figma J1.1: garantía que espera el dictamen del jefe.
      folio: '#0986',
      recibido: hace(27, '11:00'),
      cliente: { nombre: 'Karla Ibarra', telefono: '55 6611 2244', correo: 'karla.ibarra@gmail.com' },
      equipo: 'Galaxy S22 Ultra',
      imei: '359221100998877',
      tecnico: tecnico('CR'),
      estado: 'en-garantia',
      trabajo: 'Cambio de puerto de carga',
      presupuesto: { enviado: hace(27, '15:00'), descripcion: 'Cambio de puerto de carga.', refacciones: 480, manoObra: 210, total: 800, aprobado: hace(27, '17:00') },
      listaDesde: hace(25, '13:00'),
      entrega: { fecha: hace(24, '12:00'), por: 'Ana Martínez · Caja 01', pagado: 800 },
      garantia: {
        recibida: hace(0, '10:15'),
        falla: 'El equipo volvió a dejar de cargar desde ayer.',
        dictamen: 'Carlos recomienda: no aplica (humedad posterior)',
        resolucion: '',
        // Figma J4.2: reporte del técnico listo para dictaminar.
        reporte: {
          fecha: hace(0, '12:40'),
          hallazgo: 'Humedad en el puerto con corrosión reciente',
          relacion: 'No, daño posterior a la entrega',
          malUso: 'Humedad · indicador activado',
          trabajo: 'Limpieza y reemplazo del puerto',
          recomienda: 'no-aplica',
          motivo: 'humedad posterior',
          costo: 450,
        },
      },
      historial: [ev(27, '11:00', 'Recibido'), ev(24, '12:00', 'Entregado y pagado'), ev(0, '10:15', 'Recibido en garantía'), ev(0, '12:40', 'Carlos revisó: humedad posterior a la entrega')],
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
      pausa: { desde: horas(3), motivo: 'Esperando refacción', detalle: 'Solicitud R-211: Kit de sellos iPhone 11 · sin stock, pedido al proveedor (llega mañana)' },
      prometida: prometidaEn(1),
      historial: [ev(3, '12:10', 'Recibido por Ana Martínez'), ev(2, '09:15', 'Presupuesto aprobado en el portal'), ev(1, '13:00', 'Refacción pedida al proveedor'), { fecha: horas(3), texto: 'Pausada por Mariana: esperando refacción' }],
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
      anticipo: 300,
      metodoAnticipo: 'efectivo',
      accesorios: 'Funda transparente',
      // Figma C11: orden impresa (ticket y carta) de #1024.
      ficha: {
        tipo: 'Teléfono celular',
        marca: 'Samsung',
        modelo: 'Galaxy S22 Ultra',
        color: 'Negro',
        condicion: 'Pantalla con rayón lateral derecho y carcasa con golpe en la esquina inferior. Enciende; botones y cámaras funcionan. Sin humedad visible. Trae SIM.',
        recibio: 'Ana Martínez',
        falla: 'No carga; la conexión USB-C es intermitente. El equipo enciende y la pantalla funciona.',
        contrasena: 'K7M-4Q2',
      },
      // Figma J3.4: Luis encontró un daño adicional que el jefe re-cotiza.
      danoAdicional: {
        fecha: horas(1),
        texto: 'El flex de la cámara frontal está roto; la cámara frontal no enciende.',
        urgente: false,
        conceptos: [
          { tipo: 'refaccion', descripcion: 'Flex de cámara frontal S22 Ultra', sku: 'REF-S22-FCAM', cantidad: 1, costo: 160, precio: 380 },
          { tipo: 'mano-obra', descripcion: 'Mano de obra adicional', cantidad: 1, costo: 0, precio: 150, detalle: '30 min · nivel bajo' },
        ],
      },
      historial: [ev(3, '10:40', 'Recibido por Ana Martínez'), ev(2, '10:05', 'Presupuesto aprobado en el portal'), ev(1, '12:00', 'En reparación (LO)'), { fecha: horas(1), texto: 'Luis reportó daño adicional' }],
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
  crear(datos: NuevaOrden, cajera: string, contrasena?: string): Orden {
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
      ficha: { tipo: datos.tipo, marca: datos.marca, modelo: datos.modelo, color: datos.color, condicion: datos.condicion.trim(), recibio: cajera, contrasena },
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
  recibirGarantia(folio: string, falla: string, tecnicoAsignado: Tecnico, cajera: string, condicion = ''): void {
    this.actualizar(folio, (o) => ({
      ...o,
      estado: 'en-garantia',
      tecnico: tecnicoAsignado,
      garantia: { recibida: ahoraIso(), falla: falla.trim(), dictamen: 'En revisión', resolucion: '', condicion: condicion.trim() || undefined, recibio: cajera },
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
          entrega: { fecha: ahora, por, pagado: o.revision ? (o.revision.cobrar ? o.revision.monto : 0) : o.anticipo, recogio: entrega.recoge, cobrado: entrega.pagado, metodo: entrega.pagado > 0 ? entrega.metodo : undefined },
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

  /** J2.2 · Asignar o reasignar técnico (el técnico recibe el aviso en su Inicio). */
  asignar(folio: string, datos: { tecnico: Tecnico; prioridad: Prioridad; prometida: string; nota: string; por: string }): void {
    this.actualizar(folio, (o) => {
      const reasigna = o.tecnico !== POR_ASIGNAR && o.tecnico.iniciales !== datos.tecnico.iniciales;
      const texto = `${reasigna ? 'Reasignada' : 'Asignada'} a ${datos.tecnico.nombre} por ${datos.por}`;
      const notas = datos.nota.trim() ? [...(o.notas ?? []), { fecha: ahoraIso(), texto: `${datos.por}: ${datos.nota.trim()}` }] : o.notas;
      return { ...o, tecnico: datos.tecnico, prioridad: datos.prioridad, prometida: datos.prometida, notas, historial: [...o.historial, { fecha: ahoraIso(), texto }] };
    });
  }

  cambiarPrioridad(folio: string, prioridad: Prioridad, por: string): void {
    this.actualizar(folio, (o) => ({ ...o, prioridad, historial: [...o.historial, { fecha: ahoraIso(), texto: `Prioridad ${PRIORIDADES[prioridad].texto.toLowerCase()} (${por})` }] }));
  }

  /** Nota interna del jefe o del técnico (J2.3). */
  agregarNota(folio: string, texto: string, por: string): void {
    this.actualizar(folio, (o) => ({ ...o, notas: [...(o.notas ?? []), { fecha: ahoraIso(), texto: `${por}: ${texto.trim()}` }] }));
  }

  /** J3.2 · Envía el presupuesto al portal (P2.4); la orden queda "Por aprobar". */
  enviarPresupuesto(folio: string, datos: { conceptos: Concepto[]; descuento: number; mensaje: string; vigenciaDias: number; entrega: string; por: string }): void {
    const ahora = ahoraIso();
    this.actualizar(folio, (o) => {
      const refaccionesPublico = importeConceptos(datos.conceptos.filter((c) => c.tipo !== 'mano-obra'));
      const total = redondear(importeConceptos(datos.conceptos) - datos.descuento);
      const refacciones = redondear(refaccionesPublico / 1.16);
      const texto = `Presupuesto de $${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })} enviado al portal por ${datos.por}`;
      return {
        ...o,
        estado: 'por-aprobar',
        prometida: datos.entrega || o.prometida,
        presupuesto: {
          enviado: ahora,
          descripcion: datos.mensaje.trim(),
          refacciones,
          manoObra: redondear(total / 1.16 - refacciones),
          total,
          conceptos: datos.conceptos,
          descuento: datos.descuento,
          vigenciaDias: datos.vigenciaDias,
        },
        historial: [...o.historial, { fecha: ahora, texto }],
        contactos: [...o.contactos, { fecha: ahora, texto: 'Presupuesto publicado en el portal' }],
      };
    });
  }

  /** J3.2 / J3.3 · La orden vuelve al técnico con una pregunta: regresa a "Diagnóstico" en el tablero. */
  regresarAlTecnico(folio: string, pregunta: string, por: string): void {
    const ahora = ahoraIso();
    this.actualizar(folio, (o) => ({
      ...o,
      diagnostico: undefined,
      sinReparacion: undefined,
      notas: [...(o.notas ?? []), { fecha: ahora, texto: `${por}: ${pregunta.trim()}` }],
      historial: [...o.historial, { fecha: ahora, texto: `Regresada a ${o.tecnico.nombre} con dudas (${por})` }],
    }));
  }

  /** J3.3 · Confirma que el equipo no tiene reparación: pasa a entrega sin reparar (C6.2). */
  confirmarSinReparacion(folio: string, datos: { mensaje: string; cobrar: boolean; monto: number; por: string }): void {
    const ahora = ahoraIso();
    this.actualizar(folio, (o) => ({
      ...o,
      estado: 'sin-reparacion',
      trabajo: `Sin reparación · ${(o.sinReparacion?.motivo ?? 'sin pieza de reemplazo').toLowerCase()}`,
      realizado: datos.mensaje.trim(),
      revision: { cobrar: datos.cobrar, monto: datos.cobrar ? datos.monto : 0 },
      listaDesde: ahora,
      historial: [
        ...o.historial,
        { fecha: ahora, texto: `Sin reparación confirmada por ${datos.por} · ${datos.cobrar ? `revisión de $${datos.monto.toFixed(2)}` : 'sin cobro de revisión'}` },
      ],
      contactos: [...o.contactos, { fecha: ahora, texto: 'Aviso para recoger en el portal' }],
    }));
  }

  /** J3.4 · Envía al portal solo lo nuevo; lo autorizado sigue en curso. */
  enviarRecotizacion(folio: string, conceptos: Concepto[], por: string): void {
    const ahora = ahoraIso();
    this.actualizar(folio, (o) => {
      const monto = importeConceptos(conceptos);
      return {
        ...o,
        estado: 'adicional',
        adicional: { enviado: ahora, descripcion: `${o.danoAdicional?.texto ?? ''} Se agrega: ${conceptos.map((c) => c.descripcion.charAt(0).toLowerCase() + c.descripcion.slice(1)).join(' y ')}.`.trim(), monto },
        danoAdicional: undefined,
        historial: [...o.historial, { fecha: ahora, texto: `Re-cotización de $${monto.toFixed(2)} enviada al portal por ${por}` }],
        contactos: [...o.contactos, { fecha: ahora, texto: 'Re-cotización publicada en el portal' }],
      };
    });
  }

  /**
   * J4.2 · Publica el dictamen de garantía. Aplica: el técnico repara sin costo. Con costo: el cliente decide en su portal (P3.2).
   * Sin reparar: pasa a "Garantía lista" para que caja lo entregue (C6.3).
   */
  dictaminarGarantia(folio: string, datos: { tipo: TipoDictamen; texto: string; concepto?: string; costo?: number; por: string }): void {
    const ahora = ahoraIso();
    this.actualizar(folio, (o) => {
      if (!o.garantia) return o;
      const decision: DecisionGarantia = { fecha: ahora, tipo: datos.tipo, texto: datos.texto.trim(), por: datos.por };
      if (datos.tipo === 'con-costo') Object.assign(decision, { concepto: datos.concepto?.trim(), costo: datos.costo });
      const dictamen = {
        aplica: 'Cubierta por garantía',
        'con-costo': `No aplica · reparación con costo de $${(datos.costo ?? 0).toFixed(2)}`,
        'sin-reparar': 'No aplica · se devuelve sin reparar',
      }[datos.tipo];
      const texto = {
        aplica: `Garantía aplicada por ${datos.por}: se repara sin costo`,
        'con-costo': `Garantía no aplica (${datos.por}): se ofreció ${datos.concepto?.trim().toLowerCase() ?? 'la reparación'} por $${(datos.costo ?? 0).toFixed(2)}`,
        'sin-reparar': `Garantía no aplica (${datos.por}): se devuelve sin reparar`,
      }[datos.tipo];
      const sinReparar = datos.tipo === 'sin-reparar';
      return {
        ...o,
        estado: sinReparar ? 'garantia-lista' : o.estado,
        listaDesde: sinReparar ? ahora : o.listaDesde,
        garantia: { ...o.garantia, dictamen, resolucion: sinReparar ? datos.texto.trim() : o.garantia.resolucion, decision },
        historial: [...o.historial, { fecha: ahora, texto }],
        contactos: [...o.contactos, { fecha: ahora, texto: 'Dictamen de garantía publicado en el portal' }],
      };
    });
  }

  /** Anota un evento en el historial de la orden (J5: piezas entregadas, pedidas o rechazadas). */
  anotar(folio: string, texto: string): void {
    this.actualizar(folio, (o) => ({ ...o, historial: [...o.historial, { fecha: ahoraIso(), texto }] }));
  }

  /** J5.2 · La orden en el taller se pausa hasta que llegue la refacción pedida. */
  esperarRefaccion(folio: string, detalle: string): void {
    const ahora = ahoraIso();
    this.actualizar(folio, (o) =>
      o.estado === 'en-taller'
        ? { ...o, estado: 'esperando-refaccion', pausa: { desde: ahora, motivo: 'Esperando refacción', detalle }, historial: [...o.historial, { fecha: ahora, texto: `En pausa: ${detalle}` }] }
        : o,
    );
  }

  /** "Avisar al cliente" / "Enviar recordatorio por correo". */
  avisar(folio: string, texto: string): void {
    this.actualizar(folio, (o) => ({ ...o, contactos: [...o.contactos, { fecha: ahoraIso(), texto }], historial: [...o.historial, { fecha: ahoraIso(), texto }] }));
  }

  private actualizar(folio: string, cambio: (orden: Orden) => Orden): void {
    this.ordenes.update((lista) => lista.map((o) => (o.folio === folio ? cambio(o) : o)));
  }
}
