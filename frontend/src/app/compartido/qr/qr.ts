/**
 * Generador de códigos QR (modo byte, corrección de errores M, versiones 1 a 10: hasta ~210 bytes).
 * Sigue el estándar ISO/IEC 18004 con el mismo método del generador de Nayuki (MIT):
 * datos → Reed-Solomon por bloques → patrones fijos → la máscara con menor penalización.
 * Sin dependencias para no sumar librerías al proyecto.
 */

/** Códigos de corrección por bloque y número de bloques para el nivel M, por versión. */
const ECC_POR_BLOQUE = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOQUES = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const VERSION_MAXIMA = 10;

/** Módulos que no son patrones fijos (datos + corrección). */
function modulosDeDatos(version: number): number {
  let total = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alineacion = Math.floor(version / 7) + 2;
    total -= (25 * alineacion - 10) * alineacion - 55;
    if (version >= 7) total -= 36;
  }
  return total;
}

const codewordsDeDatos = (version: number) => Math.floor(modulosDeDatos(version) / 8) - ECC_POR_BLOQUE[version] * BLOQUES[version];

// ---------- Reed-Solomon en GF(2^8) ----------
function multiplicar(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function divisor(grado: number): number[] {
  const resultado = new Array<number>(grado).fill(0);
  resultado[grado - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grado; i++) {
    for (let j = 0; j < resultado.length; j++) {
      resultado[j] = multiplicar(resultado[j], raiz);
      if (j + 1 < resultado.length) resultado[j] ^= resultado[j + 1];
    }
    raiz = multiplicar(raiz, 0x02);
  }
  return resultado;
}

function residuo(datos: number[], div: number[]): number[] {
  const resultado = new Array<number>(div.length).fill(0);
  for (const b of datos) {
    const factor = b ^ (resultado.shift() as number);
    resultado.push(0);
    div.forEach((coef, i) => (resultado[i] ^= multiplicar(coef, factor)));
  }
  return resultado;
}

/** Divide en bloques, agrega la corrección de cada uno y los intercala. */
function conCorreccion(datos: number[], version: number): number[] {
  const numBloques = BLOQUES[version];
  const eccLen = ECC_POR_BLOQUE[version];
  const total = Math.floor(modulosDeDatos(version) / 8);
  const cortos = numBloques - (total % numBloques);
  const largoCorto = Math.floor(total / numBloques);
  const div = divisor(eccLen);
  const bloques: number[][] = [];
  for (let i = 0, k = 0; i < numBloques; i++) {
    const dat = datos.slice(k, k + largoCorto - eccLen + (i < cortos ? 0 : 1));
    k += dat.length;
    const ecc = residuo(dat, div);
    if (i < cortos) dat.push(0);
    bloques.push(dat.concat(ecc));
  }
  const resultado: number[] = [];
  for (let i = 0; i < bloques[0].length; i++) {
    bloques.forEach((b, j) => {
      if (i !== largoCorto - eccLen || j >= cortos) resultado.push(b[i]);
    });
  }
  return resultado;
}

// ---------- Matriz ----------
class Matriz {
  readonly tam: number;
  readonly oscuro: boolean[][];
  readonly fijo: boolean[][];

  constructor(readonly version: number) {
    this.tam = version * 4 + 17;
    this.oscuro = Array.from({ length: this.tam }, () => new Array<boolean>(this.tam).fill(false));
    this.fijo = Array.from({ length: this.tam }, () => new Array<boolean>(this.tam).fill(false));
  }

  private poner(x: number, y: number, oscuro: boolean): void {
    this.oscuro[y][x] = oscuro;
    this.fijo[y][x] = true;
  }

  patronesFijos(): void {
    for (let i = 0; i < this.tam; i++) {
      this.poner(6, i, i % 2 === 0);
      this.poner(i, 6, i % 2 === 0);
    }
    for (const [x, y] of [[3, 3], [this.tam - 4, 3], [3, this.tam - 4]]) {
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && xx < this.tam && yy >= 0 && yy < this.tam) this.poner(xx, yy, d !== 2 && d !== 4);
        }
    }
    const pos = this.alineacion();
    pos.forEach((px, i) =>
      pos.forEach((py, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.poner(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }),
    );
    this.formato(0);
    this.versionBits();
  }

  private alineacion(): number[] {
    if (this.version === 1) return [];
    const num = Math.floor(this.version / 7) + 2;
    const paso = Math.ceil((this.version * 4 + 4) / (num * 2 - 2)) * 2;
    const resultado = [6];
    for (let p = this.tam - 7; resultado.length < num; p -= paso) resultado.splice(1, 0, p);
    return resultado;
  }

  /** Nivel M (bits 00) y la máscara, con su BCH. */
  formato(mascara: number): void {
    const dato = mascara;
    let r = dato;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const bits = ((dato << 10) | r) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) this.poner(8, i, bit(i));
    this.poner(8, 7, bit(6));
    this.poner(8, 8, bit(7));
    this.poner(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.poner(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.poner(this.tam - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.poner(8, this.tam - 15 + i, bit(i));
    this.poner(8, this.tam - 8, true);
  }

  private versionBits(): void {
    if (this.version < 7) return;
    let r = this.version;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const bits = (this.version << 12) | r;
    for (let i = 0; i < 18; i++) {
      const b = ((bits >>> i) & 1) !== 0;
      const a = this.tam - 11 + (i % 3);
      const c = Math.floor(i / 3);
      this.poner(a, c, b);
      this.poner(c, a, b);
    }
  }

  codewords(datos: number[]): void {
    let i = 0;
    for (let derecha = this.tam - 1; derecha >= 1; derecha -= 2) {
      if (derecha === 6) derecha = 5;
      for (let v = 0; v < this.tam; v++)
        for (let j = 0; j < 2; j++) {
          const x = derecha - j;
          const arriba = ((derecha + 1) & 2) === 0;
          const y = arriba ? this.tam - 1 - v : v;
          if (!this.fijo[y][x] && i < datos.length * 8) {
            this.oscuro[y][x] = ((datos[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
    }
  }

  mascara(m: number): void {
    for (let y = 0; y < this.tam; y++)
      for (let x = 0; x < this.tam; x++) {
        if (this.fijo[y][x]) continue;
        const invertir = [
          (x + y) % 2 === 0,
          y % 2 === 0,
          x % 3 === 0,
          (x + y) % 3 === 0,
          (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
          ((x * y) % 2) + ((x * y) % 3) === 0,
          (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
          (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
        ][m];
        if (invertir) this.oscuro[y][x] = !this.oscuro[y][x];
      }
  }

  /** Reglas de penalización del estándar: rachas, bloques 2×2, falsos buscadores y balance de oscuros. */
  penalizacion(): number {
    const t = this.tam;
    const o = this.oscuro;
    let total = 0;
    const lineas: boolean[][] = [];
    for (let i = 0; i < t; i++) {
      lineas.push(o[i]);
      lineas.push(o.map((fila) => fila[i]));
    }
    const buscador = [true, false, true, true, true, false, true];
    for (const linea of lineas) {
      let racha = 1;
      for (let i = 1; i <= t; i++) {
        if (i < t && linea[i] === linea[i - 1]) racha++;
        else {
          if (racha >= 5) total += racha - 2;
          racha = 1;
        }
      }
      for (let i = 0; i + 7 <= t; i++) {
        if (!buscador.every((v, k) => linea[i + k] === v)) continue;
        const antes = i >= 4 && [1, 2, 3, 4].every((k) => !linea[i - k]);
        const despues = i + 11 <= t && [7, 8, 9, 10].every((k) => !linea[i + k]);
        if (antes || despues) total += 40;
      }
    }
    for (let y = 0; y < t - 1; y++)
      for (let x = 0; x < t - 1; x++) {
        const c = o[y][x];
        if (c === o[y][x + 1] && c === o[y + 1][x] && c === o[y + 1][x + 1]) total += 3;
      }
    const oscuros = o.reduce((s, fila) => s + fila.filter(Boolean).length, 0);
    total += (Math.ceil(Math.abs(oscuros * 20 - t * t * 10) / (t * t)) - 1) * 10;
    return total;
  }
}

/** Matriz del QR (true = módulo oscuro). Lanza error si el texto no cabe en la versión 10. */
export function generarQr(texto: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(texto));
  let version = 1;
  while (version <= VERSION_MAXIMA && 4 + (version <= 9 ? 8 : 16) + bytes.length * 8 > codewordsDeDatos(version) * 8) version++;
  if (version > VERSION_MAXIMA) throw new Error('El texto es demasiado largo para el código QR');

  const bits: number[] = [];
  const agregar = (valor: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((valor >>> i) & 1);
  };
  const capacidad = codewordsDeDatos(version) * 8;
  agregar(0b0100, 4);
  agregar(bytes.length, version <= 9 ? 8 : 16);
  bytes.forEach((b) => agregar(b, 8));
  agregar(0, Math.min(4, capacidad - bits.length));
  agregar(0, (8 - (bits.length % 8)) % 8);
  for (let relleno = 0xec; bits.length < capacidad; relleno ^= 0xec ^ 0x11) agregar(relleno, 8);
  const datos: number[] = [];
  for (let i = 0; i < bits.length; i += 8) datos.push(bits.slice(i, i + 8).reduce((b, bit) => (b << 1) | bit, 0));

  const matriz = new Matriz(version);
  matriz.patronesFijos();
  matriz.codewords(conCorreccion(datos, version));
  let mejor = 0;
  let menor = Infinity;
  for (let m = 0; m < 8; m++) {
    matriz.mascara(m);
    matriz.formato(m);
    const p = matriz.penalizacion();
    if (p < menor) {
      menor = p;
      mejor = m;
    }
    matriz.mascara(m);
  }
  matriz.mascara(mejor);
  matriz.formato(mejor);
  return matriz.oscuro;
}
