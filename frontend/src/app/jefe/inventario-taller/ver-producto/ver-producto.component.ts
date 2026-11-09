import { Component, computed, inject, input, output } from '@angular/core';
import { ProductoInventario } from '../../../cajera/inventario/inventario.datos';
import { InventarioService, apartadas, disponible } from '../../../cajera/inventario/inventario.service';
import { formatearDinero } from '../../../compartido/formato';
import { diaMes } from '../../por-cotizar/existencia';

/** J6 · "Ver": ubicación, proveedor, apartados por orden y últimos movimientos de una refacción. */
@Component({
  selector: 'app-ver-producto',
  standalone: true,
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-producto" (click)="$event.stopPropagation()" (keydown.escape)="cerrar.emit()">
        <div class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-producto">{{ producto().nombre }}</h2>
            <p class="modal__subtitulo">{{ producto().sku }} · {{ producto().categoria }} · {{ producto().ubicacion || 'Sin ubicación' }}</p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()"><img src="assets/inventario/x.svg" width="20" height="20" alt="" /></button>
        </div>
        <div class="cifras">
          @for (c of cifras(); track c.texto) {
            <p><strong>{{ c.valor }}</strong><span>{{ c.texto }}</span></p>
          }
        </div>
        <p class="renglon"><span>Proveedor</span><strong>{{ producto().proveedor }}</strong></p>
        <p class="renglon"><span>Costo promedio · precio de venta</span><strong>{{ dinero(producto().costo) }} · {{ dinero(producto().precio) }}</strong></p>
        @for (a of producto().apartados; track a.folio) {
          <p class="renglon"><span>Apartada para {{ a.folio }}</span><strong>{{ a.cantidad }}</strong></p>
        }
        <h3 class="campo__etiqueta">Últimos movimientos</h3>
        <ul class="movimientos">
          @for (m of movimientos(); track $index) {
            <li><span>{{ m.texto }}<small>{{ m.folio }} · {{ m.fecha }}</small></span><strong [class.negativo]="m.cantidad < 0">{{ m.cantidad > 0 ? '+' : '' }}{{ m.cantidad }}</strong></li>
          } @empty {
            <li class="vacio">Sin entradas ni ajustes registrados.</li>
          }
        </ul>
        <div class="modal__acciones">
          <button type="button" class="boton boton--contorno boton--44" (click)="cerrar.emit()">Cerrar</button>
          <button type="button" class="boton boton--primario boton--44" (click)="pedir.emit()">Pedir a proveedor</button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .modal { max-width: 520px; }
    .cifras { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .cifras p { display: flex; flex-direction: column; gap: 2px; padding: 10px; border-radius: 8px; background: var(--color-fondo); font-size: 11px; color: var(--color-texto-tenue); }
    .cifras strong { font-size: 18px; color: var(--color-marino); }
    .renglon { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--color-texto-tenue); }
    .renglon strong { font-weight: 600; text-align: right; color: var(--color-marino); }
    .movimientos { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
    .movimientos li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--color-borde); font-size: 13px; color: var(--color-marino); }
    .movimientos span { display: flex; flex-direction: column; gap: 2px; }
    .movimientos small { font-size: 11px; color: var(--color-texto-tenue); }
    .movimientos strong { color: var(--color-exito); }
    .movimientos .negativo { color: var(--color-peligro); }
    .vacio { font-size: 12px; color: var(--color-texto-tenue); }
  `,
})
export class VerProductoComponent {
  private readonly inventario = inject(InventarioService);

  readonly producto = input.required<ProductoInventario>();
  readonly cerrar = output<void>();
  readonly pedir = output<void>();

  protected readonly dinero = formatearDinero;
  protected readonly cifras = computed(() => {
    const p = this.producto();
    return [
      { texto: 'Stock', valor: p.stock },
      { texto: 'Apartadas', valor: apartadas(p) },
      { texto: 'Disponible', valor: disponible(p) },
      { texto: 'Mínimo', valor: p.minimo },
    ];
  });
  protected readonly movimientos = computed(() =>
    this.inventario
      .movimientos(this.producto().sku)
      .slice(0, 6)
      .map((m) => ({ ...m, fecha: diaMes(m.fecha) })),
  );
}
