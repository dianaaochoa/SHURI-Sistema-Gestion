import { Component, computed, inject, output, signal } from '@angular/core';
import { formatearDinero } from '../../../compartido/formato';
import { cuando } from '../../ordenes/detalle-orden/detalle-orden.component';
import { TIPOS_AJUSTE, TipoAjuste } from '../inventario.datos';
import { InventarioService } from '../inventario.service';

/** Pestaña "Ajustes de inventario": registro de ajustes (el modal C7.4 se abre desde el encabezado). */
@Component({
  selector: 'app-ajustes',
  standalone: true,
  template: `
    <div class="filtros" role="group" aria-label="Tipo de ajuste">
      <button type="button" class="estado" [class.estado--info]="tipo() === null" [class.estado--neutro]="tipo() !== null" (click)="tipo.set(null)">Todos · {{ inventario.ajustes().length }}</button>
      @for (t of tipos; track t[0]) {
        <button type="button" class="estado" [class.estado--info]="tipo() === t[0]" [class.estado--neutro]="tipo() !== t[0]" (click)="tipo.set(t[0])">{{ t[1].texto }}</button>
      }
      <span class="espacio"></span>
      <p class="total">Diferencia a costo: <strong>{{ valor() < 0 ? '− ' + dinero(-valor()) : dinero(valor()) }}</strong></p>
    </div>

    <div class="tabla-ajustes">
      <table>
        <thead>
          <tr><th>Fecha</th><th>Folio</th><th>Producto</th><th>Tipo</th><th class="num">Piezas</th><th class="num">Valor</th><th class="a-motivo">Motivo</th><th>Hizo</th><th></th></tr>
        </thead>
        <tbody>
          @for (a of lista(); track a.folio) {
            <tr>
              <td class="fuerte">{{ cuando(a.fecha) }}</td>
              <td>{{ a.folio }}</td>
              <td><span class="tenue">{{ a.sku }}</span> · {{ a.nombre }}</td>
              <td><span class="estado estado--{{ tipos_[a.tipo].tono }}">{{ tipos_[a.tipo].texto }}</span></td>
              <td class="num fuerte" [class.menos]="a.diferencia < 0" [class.mas]="a.diferencia > 0">{{ a.diferencia > 0 ? '+' : '−' }}{{ a.diferencia < 0 ? -a.diferencia : a.diferencia }}</td>
              <td class="num">{{ a.valor < 0 ? '− ' : '+ ' }}{{ dinero(a.valor < 0 ? -a.valor : a.valor) }}</td>
              <td class="a-motivo"><span>{{ a.motivo }}</span></td>
              <td>{{ a.hizo }}</td>
              <td><button type="button" class="enlace" (click)="movimientos.emit(a.sku)">Ver</button></td>
            </tr>
          } @empty {
            <tr><td colspan="9" class="vacia">No hay ajustes de este tipo.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; }
    .filtros { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .filtros .estado { border: 0; font-family: inherit; cursor: pointer; }
    .espacio { flex: 1; }
    .total { font-size: 12px; color: var(--color-texto-tenue); }
    .total strong { color: var(--color-peligro); }
    .tabla-ajustes { overflow-x: auto; border: 1px solid var(--color-borde); border-radius: 8px; background: var(--color-superficie); }
    table { width: 100%; border-collapse: collapse; font-size: 12px; color: var(--color-marino); }
    th { height: 40px; padding: 0 8px; background: var(--color-fondo); font-size: 11px; font-weight: 600; text-align: left; color: var(--color-texto-secundario); white-space: nowrap; }
    td { height: 50px; padding: 0 8px; border-top: 1px solid var(--color-borde); white-space: nowrap; }
    th:first-child, td:first-child { padding-left: 16px; }
    .num { text-align: right; }
    .fuerte { font-weight: 600; }
    .tenue { color: var(--color-texto-tenue); }
    .menos { color: var(--color-peligro); }
    .mas { color: var(--color-exito); }
    .a-motivo { max-width: 280px; }
    .a-motivo span { display: block; overflow: hidden; text-overflow: ellipsis; }
    .vacia { text-align: center; color: var(--color-texto-tenue); }
    @media (max-width: 768px) { .a-motivo { display: none; } }
  `,
})
export class AjustesComponent {
  protected readonly inventario = inject(InventarioService);
  readonly movimientos = output<string>();

  protected readonly dinero = formatearDinero;
  protected readonly cuando = cuando;
  protected readonly tipos_ = TIPOS_AJUSTE;
  protected readonly tipos = Object.entries(TIPOS_AJUSTE) as [TipoAjuste, (typeof TIPOS_AJUSTE)[TipoAjuste]][];
  protected readonly tipo = signal<TipoAjuste | null>(null);

  protected readonly lista = computed(() => this.inventario.ajustes().filter((a) => this.tipo() === null || a.tipo === this.tipo()));
  /** Pérdida neta a costo de los ajustes listados. */
  protected readonly valor = computed(() => this.lista().reduce((s, a) => s + a.valor, 0));
}
