/** Archivos CSV que abre Excel (con BOM para que respete los acentos). */
export function descargarCsv(nombre: string, filas: (string | number)[][]): void {
  const texto = filas.map((f) => f.map(celda).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}

function celda(valor: string | number): string {
  const texto = String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Lee un CSV sencillo (comas y comillas dobles). */
export function leerCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let valor = '';
  let comillas = false;
  const limpio = texto.replace(/^﻿/, '');
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') { valor += '"'; i++; }
      else if (c === '"') comillas = false;
      else valor += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(valor); valor = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i++;
      fila.push(valor);
      if (fila.some((v) => v.trim())) filas.push(fila);
      fila = [];
      valor = '';
    } else valor += c;
  }
  fila.push(valor);
  if (fila.some((v) => v.trim())) filas.push(fila);
  return filas;
}
