import { Component, computed, inject, input, output, signal } from '@angular/core';
import { ProductoInventario } from '../../../cajera/inventario/inventario.datos';
import { InventarioService } from '../../../cajera/inventario/inventario.service';
import { formatearDinero } from '../../../compartido/formato';

/** J3.2 · "Agregar refacción del inventario": busca por nombre o SKU. */
@Component({
  selector: 'app-agregar-refaccion',
  standalone: true,
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-refaccion" (click)="$event.stopPropagation()" (keydown.escape)="cerrar.emit()">
        <div class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-refaccion">Agregar refacción del inventario</h2>
            <p class="modal__subtitulo">Las que están en stock se apartan para {{ folio() }} al enviar el presupuesto.</p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()"><img src="assets/inventario/x.svg" width="20" height="20" alt="" /></button>
        </div>
        <label class="campo__control campo__control--40">
          <img src="assets/inventario/search.svg" width="16" height="16" alt="" />
          <input #buscar class="campo__input" type="search" autocomplete="off" placeholder="Buscar por nombre o SKU" aria-label="Buscar refacción" [value]="texto()" (input)="texto.set($any($event.target).value)" />
        </label>
        <ul class="lista">
          @for (p of lista(); track p.sku) {
            <li>
              <button type="button" class="producto" (click)="elegir.emit(p)">
                <span class="producto__texto"><strong>{{ p.nombre }}</strong><span>{{ p.sku }} · {{ disponible(p) }}</span></span>
                <strong>{{ dinero(p.precio) }}</strong>
              </button>
            </li>
          } @empty {
            <li class="vacio">Sin coincidencias. Usa “Agregar concepto manual”.</li>
          }
        </ul>
      </div>
    </div>
  `,
  styles: `
    .modal { max-width: 520px; }
    .lista { display: flex; flex-direction: column; gap: 6px; max-height: 360px; margin: 0; padding: 0; overflow-y: auto; list-style: none; }
    .producto { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; border: 1px solid var(--color-borde); border-radius: 8px; background: none; font: inherit; font-size: 13px; text-align: left; color: var(--color-marino); cursor: pointer; }
    .producto:hover { border-color: var(--color-primario); }
    .producto__texto { display: flex; flex: 1; flex-direction: column; gap: 2px; font-size: 11px; color: var(--color-texto-tenue); }
    .producto__texto strong { font-size: 13px; font-weight: 600; color: var(--color-marino); }
    .vacio { font-size: 13px; color: var(--color-texto-tenue); }
  `,
})
export class AgregarRefaccionComponent {
  private readonly inventario = inject(InventarioService);

  readonly folio = input.required<string>();
  readonly cerrar = output<void>();
  readonly elegir = output<ProductoInventario>();

  protected readonly dinero = formatearDinero;
  protected readonly texto = signal('');

  /** Refacciones primero; también se pueden cobrar consumibles y accesorios. */
  protected readonly lista = computed(() => {
    const t = this.texto().trim().toLowerCase();
    return this.inventario
      .productos()
      .filter((p) => !t || `${p.nombre} ${p.sku}`.toLowerCase().includes(t))
      .sort((a, b) => Number(b.categoria === 'Refacciones') - Number(a.categoria === 'Refacciones') || a.nombre.localeCompare(b.nombre))
      .slice(0, 30);
  });

  protected disponible(p: ProductoInventario): string {
    const n = this.inventario.paraOrden(p.sku, this.folio());
    return n ? `${n} en stock` : 'sin stock';
  }
}
