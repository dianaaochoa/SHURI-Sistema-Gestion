/** Meses y exportación de los reportes del administrador (AD2, AD3). */

export interface Mes {
  /** "2026-10" */
  id: string;
  /** "Octubre 2026" */
  texto: string;
  desde: Date;
  hasta: Date;
}

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** El mes actual y los 11 anteriores; el actual llega hasta hoy. */
export function ultimosMeses(hoy = new Date()): Mes[] {
  return Array.from({ length: 12 }, (_, i) => {
    const desde = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const fin = new Date(desde.getFullYear(), desde.getMonth() + 1, 0);
    const hasta = i === 0 ? new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) : fin;
    const id = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, '0')}`;
    return { id, texto: capital(`${desde.toLocaleDateString('es-MX', { month: 'long' })} ${desde.getFullYear()}`), desde, hasta };
  });
}

/** El mes anterior del mismo largo (para "+12% vs septiembre"). */
export function mesAnterior(m: Mes): Mes {
  const desde = new Date(m.desde.getFullYear(), m.desde.getMonth() - 1, 1);
  const fin = new Date(desde.getFullYear(), desde.getMonth() + 1, 0);
  const hasta = new Date(desde.getFullYear(), desde.getMonth(), Math.min(m.hasta.getDate(), fin.getDate()));
  return { id: '', texto: capital(desde.toLocaleDateString('es-MX', { month: 'long' })), desde, hasta };
}

export const dentro = (iso: string | undefined, m: Mes) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= m.desde.getTime() && t < m.hasta.getTime() + 86_400_000;
};

/** "Exportar Excel": descarga un CSV que Excel abre directo (con BOM para los acentos). */
export function exportarCsv(nombre: string, filas: (string | number)[][]): void {
  const texto = filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombre}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
