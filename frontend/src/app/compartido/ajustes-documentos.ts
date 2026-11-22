import { formatearDinero } from './formato';
import { REGLAS_TALLER, ReglasTaller } from './reglas-taller';

/**
 * Lo que imprimen el ticket y el documento de recepción (C11) y se cambia en Configuración (AD9.1 y AD9.3).
 * Son objetos simples, como REGLAS_TALLER, para que los documentos no carguen la configuración completa.
 */
export const AJUSTES_TICKET = {
  encabezado: '¡Gracias por tu compra!',
  pie: 'Cambios con ticket dentro de 7 días',
  logo: true,
  desgloseIva: true,
  quienCobro: true,
};

export interface Clausula {
  titulo: string;
  /** Puede llevar {revision} {vigencia} {garantia} {diasSinCobro} {almacenaje} {resguardo}: se llenan con lo del taller. */
  texto: string;
}

export const CLAUSULAS_RECEPCION: Clausula[] = [
  { titulo: 'Diagnóstico', texto: 'La revisión cuesta {revision} y se descuenta del total si apruebas la reparación.' },
  { titulo: 'Presupuesto', texto: 'Tiene vigencia de {vigencia}. Después de ese plazo puede cambiar el precio de las refacciones.' },
  { titulo: 'Garantía', texto: '{garantia}. Cubre la falla reparada y las piezas instaladas; no cubre golpes, humedad ni manipulación de terceros.' },
  { titulo: 'Equipos en bodega', texto: 'Después de {diasSinCobro} sin recoger se cobra almacenaje de {almacenaje} por día. {resguardo}' },
  { titulo: 'Datos e información', texto: 'SHURI no se hace responsable por la información del equipo. Recomendamos respaldarla antes de dejarlo.' },
];

/**
 * Aviso de privacidad (AD9.3): lo muestran el portal (P4.3), la autofactura y la hoja de recepción.
 * Cada sección va separada por una línea en blanco; si empieza con "1. Título", esa primera línea es el título.
 */
export const AVISO_PRIVACIDAD = {
  texto: [
    '1. ¿Qué datos usamos?\nNombre, teléfono, correo y datos de tu equipo. Si pides factura, también tus datos fiscales.',
    '2. ¿Para qué los usamos?\nPara dar seguimiento a tu reparación, avisarte en tu portal, cobrar y emitir tu factura.',
    '3. ¿Con quién los compartimos?\nSolo los usamos para tu reparación y con el SAT al facturar. Nunca los vendemos.',
    '4. Tus derechos (ARCO)\nPuedes pedir acceso, corrección, cancelación u oposición escribiendo a privacidad@shuri.mx.',
    '5. Cambios a este aviso\nSi este aviso cambia, te lo mostraremos aquí antes de tu siguiente ingreso.',
  ].join('\n\n'),
};

/** Secciones del aviso para mostrarlo numerado (Figma P4.3). */
export function seccionesPrivacidad(texto: string): { titulo: string; texto: string }[] {
  return texto
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const [primera, ...resto] = b.split('\n');
      return /^\d+\.\s/.test(primera) && resto.length ? { titulo: primera.trim(), texto: resto.join(' ').trim() } : { titulo: '', texto: b.replace(/\n/g, ' ') };
    });
}

/** Cláusula con los valores del taller (J9). */
export function llenarClausula(texto: string, r: ReglasTaller = REGLAS_TALLER): string {
  return texto
    .replace(/\{revision\}/g, formatearDinero(r.revision))
    .replace(/\{vigencia\}/g, `${r.vigenciaDias} días`)
    .replace(/\{garantia\}/g, `${r.garantiaDias} días a partir de ${r.garantiaDesde === 'entrega' ? 'la entrega' : 'la reparación'}`)
    .replace(/\{diasSinCobro\}/g, `${r.diasSinCobro} días`)
    .replace(/\{almacenaje\}/g, formatearDinero(r.almacenajeDia))
    .replace(/\{resguardo\}/g, r.despuesResguardo === 'resguardo' ? `A los ${r.diasResguardo} días el equipo pasa a resguardo.` : r.despuesResguardo === 'cobrar' ? 'Después se sigue cobrando almacenaje.' : 'Después solo se avisa al cliente.');
}

/** Formas de pago y cuenta para transferencias (AD9.2): las usa el cobro del punto de venta (C2.10–C2.13). */
export const FORMAS_PAGO_CAJA = {
  tarjeta: true,
  transferencia: true,
  mixto: true,
  banco: 'BBVA',
  clabe: '012180001234564821',
  titular: 'SHURI Reparaciones y Ventas S.A. de C.V.',
};

/** "012 180 0012 3456 4821" */
export const clabeLegible = (clabe: string): string => clabe.replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{4})(\d{4})(\d{4})$/, '$1 $2 $3 $4 $5');
