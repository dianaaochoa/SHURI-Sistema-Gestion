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
