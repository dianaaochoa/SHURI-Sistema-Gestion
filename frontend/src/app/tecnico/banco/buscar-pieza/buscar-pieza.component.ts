import { Component, computed, inject, input, output, signal } from '@angular/core';
import { ProductoInventario } from '../../../cajera/inventario/inventario.datos';
import { InventarioService } from '../../../cajera/inventario/inventario.service';

/** Buscador de refacciones y consumibles del inventario (T3.1 propuesta, T3.3 solicitar, T3.5 daño adicional). */
@Component({
  selector: 'app-buscar-pieza',
  standalone: true,
  template: `
    <label class="campo__control campo__control--40">
      <img src="assets/ventas/search.svg" width="16" height="16" alt="" />
      <input class="campo__input" type="search" autocomplete="off" [placeholder]="placeholder()" [attr.aria-label]="placeholder()" [value]="texto()" (input)="texto.set($any($event.target).value)" (keydown.escape)="texto.set('')" />
    </label>
    @if (resultados().length) {
      <ul class="sugerencias" role="listbox">
        @for (p of resultados(); track p.sku) {
          <li role="option" (mousedown)="$event.preventDefault(); elegir(p)">
            {{ p.nombre }}<span>{{ p.sku }} · {{ inventario.paraOrden(p.sku, folio()) }} en stock</span>
          </li>
        }
      </ul>
    } @else if (texto().trim().length >= 2) {
      <ul class="sugerencias"><li class="sin">Sin coincidencias en el inventario</li></ul>
    }
  `,
  styles: `
    :host { position: relative; display: block; }
    .campo__control { gap: 8px; }
    .sugerencias { top: 44px; border: 1px solid var(--color-borde); border-radius: 8px; background: var(--color-superficie); box-shadow: var(--sombra-flotante); }
    .sin { color: var(--color-texto-tenue); cursor: default; }
  `,
})
export class BuscarPiezaComponent {
  protected readonly inventario = inject(InventarioService);

  readonly placeholder = input('Agregar refacción del inventario…');
  /** Orden para la que se pide (las piezas apartadas para ella cuentan como disponibles). */
  readonly folio = input('');
  readonly elegida = output<ProductoInventario>();

  protected readonly texto = signal('');

  protected readonly resultados = computed(() => {
    const q = this.texto().trim().toLowerCase();
    if (q.length < 2) return [];
    return this.inventario
      .productos()
      .filter((p) => p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 6);
  });

  protected elegir(p: ProductoInventario): void {
    this.elegida.emit(p);
    this.texto.set('');
  }
}
