/**
 * Datos de prueba del jefe de técnicos para lo que todavía no tiene módulo:
 * mensajes de clientes (J11) y preguntas de los técnicos. Las solicitudes de refacción viven en `RefaccionesService` (J5).
 * Se reemplazan por la API cuando existan esas pantallas.
 */

const haceMin = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString();

export interface MensajeCliente {
  folio: string;
  cliente: string;
  equipo: string;
  texto: string;
  fecha: string;
}

export interface PreguntaTecnico {
  folio: string;
  tecnico: string;
  asunto: string;
  detalle: string;
  fecha: string;
}


/** Figma J1.1 y el contador “2” de Mensajes en el menú. */
export const MENSAJES_SIN_RESPONDER: MensajeCliente[] = [
  { folio: '#1024', cliente: 'María Hernández', equipo: 'Galaxy S22 Ultra', texto: 'Gracias. ¿Tengo que llevar algo?', fecha: haceMin(3) },
  { folio: '#0991', cliente: 'Paola Cruz', equipo: 'iPhone 13', texto: '¿Ya puedo pasar por él hoy?', fecha: haceMin(48) },
];

export const PREGUNTAS_TECNICOS: PreguntaTecnico[] = [
  { folio: '#1029', tecnico: 'Carlos', asunto: 'necesita un dato del cliente', detalle: 'El PIN no desbloquea el equipo · orden en pausa', fecha: haceMin(20) },
];
