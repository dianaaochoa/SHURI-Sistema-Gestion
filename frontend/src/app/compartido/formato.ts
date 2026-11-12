/** Formatos de Figma (Reglas generales): importes $1,234.56 · fechas cortas 16 oct 2026. */

const DINERO = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const DINERO_ENTERO = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

/** $1,000.00 — o $1,000 con `sinCentavos`. */
export function formatearDinero(importe: number, sinCentavos = false): string {
  return (sinCentavos ? DINERO_ENTERO : DINERO).format(importe);
}

/** 16 oct 2026 */
export function formatearFechaCorta(fecha: Date): string {
  const mes = fecha.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');
  return `${fecha.getDate()} ${mes} ${fecha.getFullYear()}`;
}

/** Viernes 16 oct 2026 */
export function formatearFechaLarga(fecha: Date): string {
  const dia = fecha.toLocaleDateString('es-MX', { weekday: 'long' });
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${formatearFechaCorta(fecha)}`;
}

/** 09:00 */
export function formatearHora(fecha: Date): string {
  return fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** 4 h 42 min */
export function formatearDuracion(desde: Date, hasta: Date): string {
  const minutos = Math.max(0, Math.floor((hasta.getTime() - desde.getTime()) / 60000));
  const horas = Math.floor(minutos / 60);
  return horas ? `${horas} h ${minutos % 60} min` : `${minutos} min`;
}

/** Buenos días / Buenas tardes / Buenas noches */
export function saludoDelDia(fecha: Date): string {
  const hora = fecha.getHours();
  return hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
}
