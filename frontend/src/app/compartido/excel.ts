/**
 * Excel (.xlsx) sin librerías. Un .xlsx es un ZIP con archivos XML:
 * - para escribir se guardan sin comprimir (método 0 del ZIP), que Excel acepta;
 * - para leer, los archivos comprimidos (método 8, deflate) se abren con `DecompressionStream` del navegador.
 * Solo se usa la primera hoja y los valores (sin fórmulas ni formatos).
 */

type Celda = string | number;

// ---------- Escribir ----------

/** Descarga `nombre.xlsx` con una hoja. Los números quedan como números; lo demás, como texto. */
export function descargarXlsx(nombre: string, filas: Celda[][], hoja = 'Hoja1'): void {
  const archivo = crearXlsx(filas, hoja);
  const url = URL.createObjectURL(new Blob([archivo], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre.endsWith('.xlsx') ? nombre : `${nombre}.xlsx`;
  enlace.click();
  URL.revokeObjectURL(url);
}

export function crearXlsx(filas: Celda[][], hoja = 'Hoja1'): Uint8Array {
  const nombreHoja = escaparXml(hoja.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Hoja1');
  const renglones = filas
    .map((fila, i) => {
      const celdas = fila
        .map((valor, j) => {
          const ref = `${columna(j)}${i + 1}`;
          if (typeof valor === 'number' && Number.isFinite(valor)) return `<c r="${ref}"><v>${valor}</v></c>`;
          const texto = String(valor ?? '');
          return texto === '' ? '' : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escaparXml(texto)}</t></is></c>`;
        })
        .join('');
      return `<row r="${i + 1}">${celdas}</row>`;
    })
    .join('');
  const archivos: [string, string][] = [
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      'xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${nombreHoja}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ],
    [
      'xl/worksheets/sheet1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${renglones}</sheetData></worksheet>`,
    ],
  ];
  return zipSinComprimir(archivos.map(([n, t]) => [n, new TextEncoder().encode(t)]));
}

/** A, B, …, Z, AA, AB… */
function columna(i: number): string {
  let texto = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) texto = String.fromCharCode(65 + ((n - 1) % 26)) + texto;
  return texto;
}

function escaparXml(texto: string): string {
  return texto.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

let tablaCrc: Uint32Array | null = null;
function crc32(datos: Uint8Array): number {
  if (!tablaCrc) {
    tablaCrc = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tablaCrc[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of datos) crc = tablaCrc[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** ZIP con los archivos guardados tal cual (sin comprimir) y nombres en UTF-8. */
function zipSinComprimir(archivos: [string, Uint8Array][]): Uint8Array {
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let desplazamiento = 0;
  const ahora = new Date();
  const hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
  const fecha = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
  for (const [nombre, datos] of archivos) {
    const nombreBytes = new TextEncoder().encode(nombre);
    const crc = crc32(datos);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, hora, true);
    local.setUint16(12, fecha, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true);
    local.setUint32(22, datos.length, true);
    local.setUint16(26, nombreBytes.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nombreBytes, datos);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, fecha, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, datos.length, true);
    c.setUint32(24, datos.length, true);
    c.setUint16(28, nombreBytes.length, true);
    c.setUint32(42, desplazamiento, true);
    central.push(new Uint8Array(c.buffer), nombreBytes);
    desplazamiento += 30 + nombreBytes.length + datos.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, desplazamiento, true);
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const salida = new Uint8Array(todo.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of todo) {
    salida.set(p, i);
    i += p.length;
  }
  return salida;
}

// ---------- Leer ----------

/** Lee la primera hoja de un .xlsx: filas de texto. Las celdas y filas vacías quedan vacías (así cada fila conserva su número de Excel). */
export async function leerXlsx(archivo: Blob): Promise<{ hoja: string; filas: string[][] }> {
  const zip = await abrirZip(new Uint8Array(await archivo.arrayBuffer()));
  const xml = async (ruta: string) => {
    const datos = await zip(ruta);
    return datos ? new DOMParser().parseFromString(new TextDecoder().decode(datos), 'application/xml') : null;
  };
  const libro = await xml('xl/workbook.xml');
  if (!libro) throw new Error('No es un libro de Excel.');
  const primera = libro.getElementsByTagName('sheet')[0];
  const hoja = primera?.getAttribute('name') ?? 'Hoja1';
  // La ruta de la hoja sale de las relaciones del libro; si no, la primera de siempre.
  let ruta = 'xl/worksheets/sheet1.xml';
  const idRel = primera?.getAttribute('r:id') ?? primera?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const rels = await xml('xl/_rels/workbook.xml.rels');
  const destino = rels && idRel ? [...Array.from(rels.getElementsByTagName('Relationship'))].find((r) => r.getAttribute('Id') === idRel)?.getAttribute('Target') : null;
  if (destino) ruta = destino.startsWith('/') ? destino.slice(1) : `xl/${destino.replace(/^\.\//, '')}`;

  const compartidas = await xml('xl/sharedStrings.xml');
  const textos = compartidas ? Array.from(compartidas.getElementsByTagName('si')).map((si) => Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join('')) : [];

  const datosHoja = await xml(ruta);
  if (!datosHoja) throw new Error('El libro no tiene hojas.');
  const filas: string[][] = [];
  for (const fila of Array.from(datosHoja.getElementsByTagName('row'))) {
    const r = Number(fila.getAttribute('r')) || filas.length + 1;
    const valores: string[] = [];
    let siguiente = 0;
    for (const c of Array.from(fila.getElementsByTagName('c'))) {
      const ref = c.getAttribute('r');
      const col = ref ? indiceColumna(ref) : siguiente;
      siguiente = col + 1;
      const tipo = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      let valor = v;
      if (tipo === 's') valor = textos[Number(v)] ?? '';
      else if (tipo === 'inlineStr') valor = Array.from(c.getElementsByTagName('t')).map((t) => t.textContent ?? '').join('');
      else if (tipo === 'b') valor = v === '1' ? 'VERDADERO' : 'FALSO';
      valores[col] = valor;
    }
    filas[r - 1] = Array.from(valores, (x) => x ?? '');
  }
  return { hoja, filas: Array.from(filas, (f) => f ?? []) };
}

function indiceColumna(ref: string): number {
  const letras = ref.match(/^[A-Z]+/)?.[0] ?? 'A';
  return [...letras].reduce((n, l) => n * 26 + (l.charCodeAt(0) - 64), 0) - 1;
}

/** Abre un ZIP: devuelve una función que da el contenido de un archivo por su ruta. */
async function abrirZip(bytes: Uint8Array): Promise<(ruta: string) => Promise<Uint8Array | null>> {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fin = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (vista.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error('El archivo no es un .xlsx válido.');
  const total = vista.getUint16(fin + 10, true);
  let p = vista.getUint32(fin + 16, true);
  const entradas = new Map<string, { metodo: number; tam: number; local: number }>();
  for (let n = 0; n < total; n++) {
    if (vista.getUint32(p, true) !== 0x02014b50) break;
    const metodo = vista.getUint16(p + 10, true);
    const tam = vista.getUint32(p + 20, true);
    const largoNombre = vista.getUint16(p + 28, true);
    const largoExtra = vista.getUint16(p + 30, true);
    const largoComentario = vista.getUint16(p + 32, true);
    const local = vista.getUint32(p + 42, true);
    const nombre = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + largoNombre));
    entradas.set(nombre, { metodo, tam, local });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return async (ruta) => {
    const e = entradas.get(ruta);
    if (!e) return null;
    const inicio = e.local + 30 + vista.getUint16(e.local + 26, true) + vista.getUint16(e.local + 28, true);
    const datos = bytes.subarray(inicio, inicio + e.tam);
    if (e.metodo === 0) return datos;
    if (e.metodo !== 8) throw new Error('El .xlsx usa una compresión que no se puede leer.');
    const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
  };
}
