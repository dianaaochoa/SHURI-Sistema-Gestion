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

/** Aviso de privacidad (AD9.3): lo muestran el portal, la autofactura y la hoja de recepción. */
export const AVISO_PRIVACIDAD = {
  texto:
    'SHURI Reparaciones y Ventas usa tus datos (nombre, teléfono y correo) solo para avisarte del estado de tu equipo, emitir tus facturas y atender garantías. No los compartimos con terceros. Puedes pedir su acceso, corrección o cancelación escribiendo a privacidad@shuri.mx.',
};

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
