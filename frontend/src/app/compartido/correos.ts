import { formatearDinero } from './formato';
import type { Correo } from './correos.service';

/** Plantillas de los correos de Figma P6 y su HTML. Se cargan bajo demanda (no van en el paquete inicial). */

type Base = { para: string; nombre: string; folio: string };
const primerNombre = (n: string) => n.trim().split(/\s+/)[0] ?? '';
const sinGato = (folio: string) => folio.replace('#', '');
const dia = (iso: string) => {
  const f = new Date(iso);
  return `${f.getDate()} ${f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;
};
const diaAnio = (iso: string) => `${dia(iso)} ${new Date(iso).getFullYear()}`;

/** Contenido de cada correo de Figma P6. */
export const CORREOS = {
  acceso: (d: Base & { equipo: string; temporal: string }): Omit<Correo, 'id' | 'fecha'> => ({
    tipo: 'acceso',
    para: d.para,
    folio: d.folio,
    asunto: `Tu acceso al portal · Folio ${d.folio}`,
    titulo: 'Bienvenido a tu portal de seguimiento',
    parrafo: `Hola ${primerNombre(d.nombre)}, registramos tu ${d.equipo} con el folio ${d.folio}. Entra a shuri.mx con tu correo y esta contraseña temporal. Al entrar te pediremos crear una nueva.`,
    destacado: { etiqueta: 'Contraseña temporal', valor: d.temporal, nota: 'También viene impresa en tu hoja de recepción.', tono: 'info' },
    boton: { texto: 'Entrar a mi portal', ruta: '/portal' },
  }),
  cotizacion: (d: Base & { descripcion: string; total: number; anticipo: number }): Omit<Correo, 'id' | 'fecha'> => ({
    tipo: 'cotizacion',
    para: d.para,
    folio: d.folio,
    asunto: `Tu cotización está lista · Folio ${d.folio}`,
    titulo: 'Revisa y autoriza tu reparación',
    parrafo: `Hola ${primerNombre(d.nombre)}, el jefe de técnicos ya revisó tu equipo. ${d.descripcion}`,
    destacado: {
      etiqueta: 'Total · IVA incluido',
      valor: formatearDinero(d.total),
      nota: `${d.anticipo > 0 ? `Ya pagaste ${formatearDinero(d.anticipo)} de anticipo. ` : ''}Nada se repara sin tu autorización.`,
      tono: 'info',
    },
    boton: { texto: 'Ver y autorizar', ruta: `/portal/equipo/${sinGato(d.folio)}` },
  }),
  listo: (d: Base & { equipo: string; restante: number; limite: string }): Omit<Correo, 'id' | 'fecha'> => ({
    tipo: 'listo',
    para: d.para,
    folio: d.folio,
    asunto: `Tu equipo está listo para recoger · Folio ${d.folio}`,
    titulo: '¡Tu equipo está listo!',
    parrafo: `Hola ${primerNombre(d.nombre)}, terminamos la reparación de tu ${d.equipo}. Pasa por él con tu folio e identificación.`,
    destacado: { etiqueta: 'Restante por pagar', valor: formatearDinero(d.restante), nota: `Tienes hasta el ${dia(d.limite)} para recogerlo antes de que pase a bodega.`, tono: 'exito' },
    boton: { texto: 'Ver detalles', ruta: `/portal/equipo/${sinGato(d.folio)}` },
  }),
  bodega: (d: Base & { equipo: string; listoDesde: string; limite: string; almacenaje: number; dias: number }): Omit<Correo, 'id' | 'fecha'> => ({
    tipo: 'bodega',
    para: d.para,
    folio: d.folio,
    asunto: d.dias > 0 ? `Tu equipo pasará a bodega en ${d.dias} ${d.dias === 1 ? 'día' : 'días'} · Folio ${d.folio}` : `Tu equipo ya está en bodega · Folio ${d.folio}`,
    titulo: 'Tu equipo sigue esperándote',
    parrafo: `Hola ${primerNombre(d.nombre)}, tu ${d.equipo} está listo desde el ${dia(d.listoDesde)}. Si no lo recoges antes del ${dia(d.limite)} pasará a bodega y se cobrará almacenaje de ${formatearDinero(d.almacenaje)} por día.`,
    destacado: { etiqueta: 'Fecha límite', valor: diaAnio(d.limite), nota: 'Después se cobra almacenaje según la cláusula 4.', tono: 'advertencia' },
    boton: { texto: 'Ver mi orden', ruta: `/portal/equipo/${sinGato(d.folio)}` },
  }),
  respuesta: (d: Base & { jefe: string; texto: string }): Omit<Correo, 'id' | 'fecha'> => ({
    tipo: 'respuesta',
    para: d.para,
    folio: d.folio,
    asunto: `${primerNombre(d.jefe)} te respondió · Folio ${d.folio}`,
    titulo: 'Tienes una respuesta del taller',
    parrafo: `${d.jefe}, jefe de técnicos, respondió tu mensaje: “${d.texto.length > 220 ? d.texto.slice(0, 217) + '…' : d.texto}”`,
    boton: { texto: 'Responder en el chat', ruta: `/portal/chat/${sinGato(d.folio)}` },
  }),
};

const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** HTML para correo (tablas y estilos en línea, como lo pide la mayoría de los clientes de correo). */
export function correoHtml(c: Correo, negocio: { remitente: string; direccion: string; sitio: string }): string {
  const colores = { info: ['#e7f5f7', '#087f91'], exito: ['#eaf6ef', '#187047'], advertencia: ['#fff4dc', '#925d0b'] };
  const [fondo, color] = c.destacado ? colores[c.destacado.tono] : ['', ''];
  const destacado = c.destacado
    ? `<tr><td style="padding:0 32px 20px"><table width="100%" style="background:${fondo};border-radius:8px"><tr><td style="padding:16px 20px;font:12px Arial,sans-serif;color:#64748b">${escapar(c.destacado.etiqueta)}<div style="font:bold 24px Arial,sans-serif;color:${color};margin:4px 0">${escapar(c.destacado.valor)}</div>${escapar(c.destacado.nota)}</td></tr></table></td></tr>`
    : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapar(c.asunto)}</title></head><body style="margin:0;background:#eef1f4">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4;padding:24px 0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #dce2e8;border-radius:12px">
<tr><td style="padding:24px 32px 8px;font:bold 15px Arial,sans-serif;color:#17374e">SHURI<div style="font:12px Arial,sans-serif;color:#64748b">Reparaciones y Ventas</div></td></tr>
<tr><td style="padding:8px 32px;font:bold 22px Arial,sans-serif;color:#17374e">${escapar(c.titulo)}</td></tr>
<tr><td style="padding:0 32px 16px;font:14px/1.45 Arial,sans-serif;color:#273b4a">${escapar(c.parrafo)}</td></tr>
${destacado}
<tr><td style="padding:0 32px 28px"><a href="https://${negocio.sitio}${c.boton.ruta}" style="display:inline-block;padding:12px 22px;border-radius:6px;background:#087f91;color:#ffffff;font:bold 15px Arial,sans-serif;text-decoration:none">${escapar(c.boton.texto)}</a></td></tr>
<tr><td style="padding:16px 32px;background:#f3f4f6;border-radius:0 0 12px 12px;font:11px Arial,sans-serif;color:#64748b">Este correo se envía automáticamente. Para dudas, escríbenos por el chat de tu portal en ${escapar(negocio.sitio)}.<br>${escapar(negocio.direccion)} · Aviso de privacidad: ${escapar(negocio.sitio)}/privacidad</td></tr>
</table></td></tr></table></body></html>`;
}

