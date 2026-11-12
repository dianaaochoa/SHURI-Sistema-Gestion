import { Component, computed, inject, input, output } from '@angular/core';
import { FORMAS_PAGO, Pedido } from '../../../cajera/inventario/inventario.datos';
import { InventarioService } from '../../../cajera/inventario/inventario.service';
import { formatearDinero } from '../../../compartido/formato';
import { diaMes } from '../../por-cotizar/existencia';

/** J5.4 · "Ver": las piezas, costos y datos de un pedido. */
@Component({
  selector: 'app-ver-pedido',
  standalone: true,
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-ver-pedido" (click)="$event.stopPropagation()" (keydown.escape)="cerrar.emit()">
        <div class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-ver-pedido">Pedido {{ pedido().folio }}</h2>
            <p class="modal__subtitulo">{{ pedido().proveedor }} · {{ pago() }} · {{ llega() }}</p>
          </div>
          <span class="estado estado--{{ estado().tono }}">{{ estado().texto }}</span>
        </div>
        <ul class="lineas">
          @for (l of lineas(); track $index) {
            <li><span><strong>{{ l.nombre }}</strong><small>{{ l.para }} · {{ l.cantidad }} × {{ dinero(l.costo) }}</small></span><strong>{{ dinero(l.cantidad * l.costo) }}</strong></li>
          }
        </ul>
        <p class="renglon"><span>Total del pedido (sin IVA)</span><strong>{{ dinero(total()) }}</strong></p>
        @if (pedido().nota) {
          <p class="nota">{{ pedido().nota }}</p>
        }
        <div class="modal__acciones">
          <button type="button" class="boton boton--contorno boton--44" (click)="cerrar.emit()">Cerrar</button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .modal { max-width: 520px; }
    .lineas { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
    .lineas li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--color-borde); font-size: 13px; color: var(--color-marino); }
    .lineas span { display: flex; flex-direction: column; gap: 2px; }
    .lineas small { font-size: 11px; color: var(--color-texto-tenue); }
    .renglon { display: flex; justify-content: space-between; font-size: 13px; color: var(--color-texto-tenue); }
    .renglon strong { color: var(--color-marino); }
    .nota { font-size: 12px; color: var(--color-texto-tenue); }
  `,
})
export class VerPedidoComponent {
  private readonly inventario = inject(InventarioService);

  readonly pedido = input.required<Pedido>();
  readonly estado = input.required<{ texto: string; tono: string }>();
  readonly cerrar = output<void>();

  protected readonly dinero = formatearDinero;
  protected readonly pago = computed(() => FORMAS_PAGO[this.pedido().pago].corto);
  protected readonly llega = computed(() => `${this.estado().texto.startsWith('Recibido') || this.estado().texto === 'Reclamado' ? 'recibido' : 'llega'} ${diaMes(this.pedido().llega)}`);
  protected readonly lineas = computed(() =>
    this.pedido().lineas.map((l) => ({ ...l, nombre: this.inventario.buscar(l.sku)?.nombre ?? l.sku, para: l.orden ? `Para ${l.orden}` : 'Para stock' })),
  );
  protected readonly total = computed(() => this.pedido().lineas.reduce((s, l) => s + l.cantidad * l.costo, 0));
}
