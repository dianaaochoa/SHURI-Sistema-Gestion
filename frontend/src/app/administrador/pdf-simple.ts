/** PDF de texto sencillo (hoja carta, Helvetica) sin librerías: facturas (AD6) y bitácora (AD8). */

/** Texto en WinAnsi: acentos con escapes octales; lo demás fuera de Latin-1 se cambia. */
const texto = (t: string) =>
  t
    .replace(/[–—]/g, '-')
    .replace(/[→]/g, '->')
    .replace(/[“”]/g, '"')
    .replace(/[\\()]/g, '\\$&')
    .replace(/[^\x20-\x7e]/g, (ch) => {
      const c = ch.charCodeAt(0);
      return c < 256 ? `\\${c.toString(8).padStart(3, '0')}` : '?';
    });

const LINEAS_POR_HOJA = 46;

/** Arma un PDF con una línea por renglón; corta líneas largas y agrega hojas cuando hace falta. */
export function pdfDeLineas(lineas: string[], tamano = 10): Blob {
  const ancho = Math.floor(500 / (tamano * 0.5));
  const cortadas = lineas.flatMap((l) => {
    if (l.length <= ancho) return [l];
    const partes: string[] = [];
    for (let i = 0; i < l.length; i += ancho) partes.push((i ? '    ' : '') + l.slice(i, i + ancho));
    return partes;
  });
  const hojas: string[][] = [];
  for (let i = 0; i < Math.max(1, cortadas.length); i += LINEAS_POR_HOJA) hojas.push(cortadas.slice(i, i + LINEAS_POR_HOJA));

  // 1 catálogo, 2 páginas, 3 fuente; después cada hoja ocupa dos objetos (página y contenido).
  const objetos = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
  const kids: string[] = [];
  for (const hoja of hojas) {
    const pagina = objetos.length + 1;
    kids.push(`${pagina} 0 R`);
    const flujo = `BT /F1 ${tamano} Tf ${Math.round(tamano * 1.5)} TL 50 760 Td ${hoja.map((l) => `(${texto(l)}) '`).join(' ')} ET`;
    objetos.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pagina + 1} 0 R >>`);
    objetos.push(`<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`);
  }
  objetos[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;

  let pdf = '%PDF-1.4\n';
  const posiciones: number[] = [];
  objetos.forEach((o, i) => {
    posiciones.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posiciones.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}

export function descargar(nombre: string, contenido: Blob): void {
  const url = URL.createObjectURL(contenido);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
