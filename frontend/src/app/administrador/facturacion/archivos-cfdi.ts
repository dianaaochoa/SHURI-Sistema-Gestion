import { formatearDinero } from '../../compartido/formato';
import { Cfdi, ESTADOS_CFDI, MOTIVOS_CANCELACION, serieFolio } from '../facturacion.service';

/** Emisor de prueba (RFC genérico de pruebas del SAT) hasta que AD9 guarde los datos fiscales del negocio. */
const EMISOR = { rfc: 'EKU9003173C9', nombre: 'SHURI REPARACION Y VENTA', regimen: '626', cp: '06700' };

/** Fecha local sin zona, como la pide el CFDI (2026-11-12T13:42:00). */
const fechaLocal = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
};

const sinIva = (total: number) => Math.round((total / 1.16) * 100) / 100;

function descargar(nombre: string, contenido: Blob): void {
  const url = URL.createObjectURL(contenido);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

const atributo = (t: string) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** XML con la forma de un CFDI 4.0 (simulado: sin sello ni certificado). */
export function descargarXml(c: Cfdi): void {
  const subtotal = sinIva(c.total);
  const iva = Math.round((c.total - subtotal) * 100) / 100;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Simulado: el timbrado real lo hará el PAC al conectar la API -->
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="${c.serie}" Folio="${c.folio}" Fecha="${fechaLocal(c.fecha)}" SubTotal="${subtotal.toFixed(2)}" Moneda="MXN" Total="${c.total.toFixed(2)}" TipoDeComprobante="I" Exportacion="01" LugarExpedicion="${EMISOR.cp}">
  <cfdi:Emisor Rfc="${EMISOR.rfc}" Nombre="${EMISOR.nombre}" RegimenFiscal="${EMISOR.regimen}"/>
  <cfdi:Receptor Rfc="${atributo(c.rfc)}" Nombre="${atributo(c.cliente.toUpperCase())}" UsoCFDI="${c.global ? 'S01' : 'G03'}"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="${c.global ? '01010101' : '81112300'}" Cantidad="1" ClaveUnidad="ACT" Descripcion="${atributo(c.origen)}" ValorUnitario="${subtotal.toFixed(2)}" Importe="${subtotal.toFixed(2)}" ObjetoImp="02"/>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${iva.toFixed(2)}"/>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="${c.uuid}" FechaTimbrado="${fechaLocal(c.fecha)}"/>
  </cfdi:Complemento>
</cfdi:Comprobante>
`;
  descargar(`${serieFolio(c)}.xml`, new Blob([xml], { type: 'application/xml' }));
}

/** Texto en WinAnsi para el PDF: acentos con escapes octales; lo demás fuera de Latin-1 se cambia. */
const pdfTexto = (t: string) =>
  t
    .replace(/[–—]/g, '-')
    .replace(/[\\()]/g, '\\$&')
    .replace(/[^\x20-\x7e]/g, (ch) => {
      const c = ch.charCodeAt(0);
      return c < 256 ? `\\${c.toString(8).padStart(3, '0')}` : '?';
    });

/** Representación impresa sencilla del CFDI (una hoja carta). */
export function descargarPdf(c: Cfdi): void {
  const subtotal = sinIva(c.total);
  const lineas = [
    `Factura ${serieFolio(c)} · CFDI 4.0 (representación impresa, simulada)`,
    '',
    `Emisor: ${EMISOR.nombre} · RFC ${EMISOR.rfc}`,
    `Receptor: ${c.cliente} · RFC ${c.rfc}`,
    `Fecha: ${new Date(c.fecha).toLocaleString('es-MX')}`,
    `Folio fiscal (UUID): ${c.uuid}`,
    `Concepto: ${c.origen}`,
    '',
    `Subtotal: ${formatearDinero(subtotal)}`,
    `IVA 16%: ${formatearDinero(c.total - subtotal)}`,
    `Total: ${formatearDinero(c.total)}`,
    '',
    `Estado: ${ESTADOS_CFDI[c.estado].texto}${c.cancelacion ? ` · motivo ${MOTIVOS_CANCELACION[c.cancelacion.motivo].texto}` : ''}`,
  ];
  const flujo = `BT /F1 11 Tf 16 TL 56 760 Td ${lineas.map((l) => `(${pdfTexto(l)}) '`).join(' ')} ET`;
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const posiciones: number[] = [];
  objetos.forEach((o, i) => {
    posiciones.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posiciones.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  descargar(`${serieFolio(c)}.pdf`, new Blob([pdf], { type: 'application/pdf' }));
}
