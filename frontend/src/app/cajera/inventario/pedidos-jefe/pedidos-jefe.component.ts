import { Component, inject, input, output } from '@angular/core';
import { diaMes } from '../../ordenes/detalle-orden/detalle-orden.component';
import { Pedido } from '../inventario.datos';
import { InventarioService } from '../inventario.service';

/** C7.5 · Panel "Pedidos por recibir del jefe de técnicos" (tarjetas con radio). */
@Component({
  selector: 'app-pedidos-jefe',
  standalone: true,
  template: `
    <div class="titulo">
      <h2 id="titulo-pedidos"><img src="assets/inventario/truck-titulo.svg" width="16" height="16" alt="" />Pedidos por recibir del jefe de técnicos</h2>
      @if (elegido()) {
        <button type="button" class="enlace" (click)="elegir.emit(null)">Registrar compra directa</button>
      }
    </div>
    <div class="pedidos" role="radiogroup" aria-labelledby="titulo-pedidos">
      @for (p of inventario.pedidos(); track p.folio) {
        <button type="button" role="radio" class="pedido" [class.pedido--elegido]="elegido() === p.folio" [attr.aria-checked]="elegido() === p.folio" (click)="elegir.emit(elegido() === p.folio ? null : p)">
          <span class="pedido__radio"></span>
          <span class="pedido__texto">
            <strong>{{ p.folio }} · {{ p.proveedor }}</strong>
            <span>{{ resumen(p) }}</span>
          </span>
          @for (l of p.lineas; track $index) {
            @if (l.orden) { <span class="estado estado--info">{{ l.orden }}</span> }
          }
          <span class="estado estado--{{ llegada(p).tono }}">{{ llegada(p).texto }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid var(--color-borde); border-radius: 8px; background: var(--color-superficie); }
    .titulo { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    h2 { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--color-marino); }
    .pedidos { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }
    .pedido { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 10px 12px; border: 1px solid var(--color-borde); border-radius: 8px; background: var(--color-superficie); font: inherit; text-align: left; cursor: pointer; }
    .pedido:hover { border-color: var(--color-primario); }
    .pedido--elegido { border-color: var(--color-primario); background: var(--color-primario-suave); }
    .pedido__radio { flex-shrink: 0; width: 16px; height: 16px; border: 1.5px solid var(--color-menu-icono); border-radius: 999px; }
    .pedido--elegido .pedido__radio { border: 5px solid var(--color-primario); }
    .pedido__texto { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; font-size: 11px; color: var(--color-texto-tenue); }
    .pedido__texto > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pedido__texto strong { font-size: 13px; font-weight: 600; color: var(--color-marino); }
    @media (max-width: 560px) {
      .titulo { flex-wrap: wrap; }
      .pedidos { grid-template-columns: minmax(0, 1fr); }
      .pedido { flex-wrap: wrap; }
      .pedido__texto { flex-basis: calc(100% - 28px); }
    }
  `,
})
export class PedidosJefeComponent {
  protected readonly inventario = inject(InventarioService);
  readonly elegido = input<string | null>(null);
  readonly elegir = output<Pedido | null>();

  protected resumen(p: Pedido): string {
    const piezas = p.lineas.map((l) => `${this.inventario.buscar(l.sku)?.nombre ?? l.sku} ×${l.cantidad}`).join(' · ');
    return p.pago === 'efectivo' ? `${piezas} · Pago: efectivo de caja` : piezas;
  }

  protected llegada(p: Pedido): { texto: string; tono: string } {
    if (new Date(p.llega).toDateString() === new Date().toDateString()) return { texto: 'Llega hoy', tono: 'exito' };
    return new Date(p.llega) < new Date() ? { texto: 'Atrasado', tono: 'peligro' } : { texto: diaMes(p.llega), tono: 'neutro' };
  }
}
