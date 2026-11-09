import { FormaPago } from '../../cajera/inventario/inventario.datos';

/** Opciones de los modales de pedido (Figma J5.2 y J5.5). */
export const PAGOS_PEDIDO: { id: FormaPago; texto: string }[] = [
  { id: 'efectivo', texto: 'Efectivo de caja al recibir' },
  { id: 'transferencia', texto: 'Transferencia' },
  { id: 'credito', texto: 'Crédito 15 días' },
];

export const RECIBE: string[] = ['Caja · mostrador', 'Jefe de técnicos'];

/** "2026-11-09" para <input type="date">, a `dias` días de hoy. */
export function fechaInput(dias: number): string {
  const f = new Date(Date.now() + dias * 86_400_000);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}`;
}

/** La fecha elegida, a mediodía, en ISO. */
export const desdeInput = (valor: string) => new Date(`${valor}T12:00`).toISOString();
