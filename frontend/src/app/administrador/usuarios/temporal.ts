/** Sin 0/O, 1/I/L para que se pueda dictar y copiar a mano. */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Contraseña temporal tipo "Q8T-3ZK" con números aleatorios del navegador. */
export function generarTemporal(): string {
  const valores = crypto.getRandomValues(new Uint32Array(6));
  const t = Array.from(valores, (v) => ALFABETO[v % ALFABETO.length]).join('');
  return `${t.slice(0, 3)}-${t.slice(3)}`;
}

/** "Daniela Ortiz Méndez" → "dortiz". */
export function sugerirUsuario(nombre: string): string {
  const partes = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (!partes.length) return '';
  return (partes[0][0] + (partes[1] ?? partes[0].slice(1))).slice(0, 20);
}
