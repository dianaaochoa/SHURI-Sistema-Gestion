import { Orden, TECNICOS, Tecnico } from '../cajera/ordenes/ordenes.service';
import { etapaGarantia } from '../jefe/garantias/garantia';
import { etapaDe } from '../jefe/etapas';

/** Horario del taller (Figma T1.1 y J7); con la API vendrá del turno de cada técnico. */
export const TURNO = '9:00–18:00';

/** "hace 3 min", "hace 2 h", "hace 2 días" */
export function hace(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} ${Math.floor(h / 24) === 1 ? 'día' : 'días'}`;
}

/** El técnico de la sesión (por su nombre; con la API vendrá en la sesión). */
export const tecnicoDe = (nombre: string | undefined): Tecnico | undefined => TECNICOS.find((t) => t.nombre === nombre);

/** Sus equipos en el tablero: asignados y todavía sin terminar (de "Diagnóstico" a "En taller" en J2). */
export function asignadas(t: Tecnico | undefined, ordenes: Orden[]): Orden[] {
  if (!t) return [];
  return ordenes.filter((o) => o.tecnico.iniciales === t.iniciales && !!etapaDe(o) && etapaDe(o) !== 'listo');
}

/** Lo que puede trabajar ya: diagnosticar, reparar o revisar una garantía (lo demás espera al jefe o al cliente). */
export function trabajable(o: Orden): boolean {
  if (etapaDe(o) === 'diagnostico') return true;
  if (o.estado === 'en-taller' || o.estado === 'adicional') return true;
  const g = etapaGarantia(o);
  return g === 'en-revision' || g === 'en-reparacion';
}

/** "17 oct" */
export function diaCorto(iso: string): string {
  const f = new Date(iso);
  return `${f.getDate()} ${f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;
}

/** "hoy", "ayer", "hace 3 días" */
function diasAtras(iso: string): string {
  const d = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000);
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`;
}

/** Etiqueta y renglón de detalle de una orden en la cola del técnico (Figma T1.1). */
export function enCola(o: Orden): { texto: string; tono: string; detalle: string } {
  const prometido = o.prometida ? ` · Prometido ${diaCorto(o.prometida)}` : '';
  if (o.garantia && o.estado === 'en-garantia') {
    const g = etapaGarantia(o);
    const paso = g === 'en-revision' ? 'por revisar' : g === 'por-dictaminar' ? 'esperando dictamen del jefe' : 'dictamen: repararla';
    return { texto: 'Garantía', tono: 'peligro', detalle: `Garantía: ${minuscula(o.garantia.falla)} · ${paso}` };
  }
  switch (etapaDe(o)) {
    case 'diagnostico':
      return { texto: 'Diagnóstico', tono: 'neutro', detalle: `${o.trabajo} · Recibido ${diasAtras(o.recibido)}${prometido}` };
    case 'por-cotizar':
      return { texto: 'Por cotizar', tono: 'neutro', detalle: `Diagnóstico enviado ${diasAtras(o.diagnostico!.fecha)} · esperando al jefe${prometido}` };
    case 'por-aprobar':
      return { texto: 'Por aprobar', tono: 'advertencia', detalle: `${o.trabajo} · presupuesto enviado al cliente${prometido}` };
  }
  if (o.estado === 'adicional') return { texto: 'Cargo adicional', tono: 'advertencia', detalle: `${o.trabajo} · el cliente revisa el adicional${prometido}` };
  if (o.estado === 'esperando-refaccion') return { texto: 'En pausa', tono: 'neutro', detalle: `${o.pausa?.motivo ?? 'Esperando refacción'}${prometido}` };
  return { texto: 'En taller', tono: 'info', detalle: `${o.trabajo} · autorizado${prometido}` };
}

const minuscula = (texto: string) => (texto.charAt(0).toLowerCase() + texto.slice(1)).replace(/\.$/, '');
