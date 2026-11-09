/**
 * Datos de prueba del jefe de técnicos para lo que todavía no tiene módulo:
 * las preguntas de los técnicos (llegarán desde su app, T). Los mensajes de clientes viven en `MensajesService` (J11)
 * y las solicitudes de refacción en `RefaccionesService` (J5).
 * Se reemplazan por la API cuando existan esas pantallas.
 */

const haceMin = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString();


export interface PreguntaTecnico {
  folio: string;
  tecnico: string;
  asunto: string;
  detalle: string;
  fecha: string;
}



export const PREGUNTAS_TECNICOS: PreguntaTecnico[] = [
  { folio: '#1029', tecnico: 'Carlos', asunto: 'necesita un dato del cliente', detalle: 'El PIN no desbloquea el equipo · orden en pausa', fecha: haceMin(20) },
];
