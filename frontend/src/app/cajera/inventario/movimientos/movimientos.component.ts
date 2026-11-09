import { Component, HostListener, computed, inject, input, output } from '@angular/core';
import { formatearDinero } from '../../../compartido/formato';
import { cuando } from '../../ordenes/detalle-orden/detalle-orden.component';
import { InventarioService, apartadas, disponible } from '../inventario.service';

/** Historial de un producto (ícono de reloj del catálogo): entradas, apartados y ajustes. */
@Component({
  selector: 'app-movimientos',
  standalone: true,
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      @if (producto(); as p) {
        <section class="modal movimientos" role="dialog" aria-modal="true" aria-labelledby="titulo-movimientos" (click)="$event.stopPropagation()">
          <header class="modal__encabezado">
            <div>
              <h2 class="modal__titulo" id="titulo-movimientos">{{ p.nombre }}</h2>
              <p class="modal__subtitulo">{{ p.sku }} · {{ p.categoria }} · {{ p.proveedor }}{{ p.ubicacion ? ' · ' + p.ubicacion : '' }}</p>
            </div>
            <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()">
              <img src="assets/inventario/x.svg" width="20" height="20" alt="" />
            </button>
          </header>

          <dl class="cifras">
            <div><dt>Stock</dt><dd>{{ p.stock }}</dd></div>
            <div><dt>Apartadas</dt><dd>{{ apartadas(p) || '—' }}</dd></div>
            <div><dt>Disponible</dt><dd class="exito">{{ disponible(p) }}</dd></div>
            <div><dt>Costo promedio</dt><dd>{{ dinero(p.costo) }}</dd></div>
            <div><dt>Precio de venta</dt><dd>{{ dinero(p.precio) }}</dd></div>
          </dl>
          @if (p.apartados.length) {
            <p class="apartados">Apartadas para {{ textoApartados() }}: no se pueden vender en Punto de venta.</p>
          }

          <ul class="lista">
            @for (m of lista(); track $index) {
              <li>
                <span class="lista__texto"><strong>{{ m.folio }}</strong> · {{ m.texto }}<small>{{ cuando(m.fecha) }}</small></span>
                <strong [class.mas]="m.cantidad > 0" [class.menos]="m.cantidad < 0">{{ m.cantidad > 0 ? '+' : '−' }}{{ m.cantidad < 0 ? -m.cantidad : m.cantidad }}</strong>
              </li>
            } @empty {
              <li class="lista__vacia">Sin entradas ni ajustes registrados. Las ventas aparecerán aquí cuando se conecte la API.</li>
            }
          </ul>

          <div class="modal__acciones">
            <button type="button" class="boton boton--contorno boton--44" (click)="editar.emit()">
              <img src="assets/inventario/pencil.svg" width="16" height="16" alt="" />Editar producto
            </button>
            <button type="button" class="boton boton--primario boton--44" (click)="ajustar.emit()">Ajustar stock</button>
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    .movimientos { max-width: 560px; }
    .cifras { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 12px 14px; border-radius: 8px; background: var(--color-fondo); }
    .cifras dt { font-size: 11px; color: var(--color-texto-tenue); }
    .cifras dd { margin: 4px 0 0; font-size: 14px; font-weight: 600; color: var(--color-marino); }
    .cifras .exito { color: var(--color-exito); }
    .apartados { font-size: 12px; font-weight: 600; color: var(--color-advertencia); }
    .lista { margin: 0; padding: 0; overflow: auto; max-height: 280px; border: 1px solid var(--color-borde); border-radius: 8px; list-style: none; }
    .lista li { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-top: 1px solid var(--color-borde); font-size: 12px; color: var(--color-texto-secundario); }
    .lista li:first-child { border-top: 0; }
    .lista__texto { flex: 1; min-width: 0; }
    .lista__texto strong { color: var(--color-marino); }
    .lista small { display: block; margin-top: 2px; font-size: 11px; color: var(--color-texto-tenue); }
    .lista .mas { color: var(--color-exito); }
    .lista .menos { color: var(--color-peligro); }
    .lista__vacia { color: var(--color-texto-tenue) !important; }
    @media (max-width: 560px) { .cifras { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  `,
})
export class MovimientosComponent {
  private readonly inventario = inject(InventarioService);
  readonly sku = input.required<string>();
  readonly cerrar = output<void>();
  readonly ajustar = output<void>();
  readonly editar = output<void>();

  protected readonly dinero = formatearDinero;
  protected readonly cuando = cuando;
  protected readonly apartadas = apartadas;
  protected readonly disponible = disponible;
  protected readonly producto = computed(() => this.inventario.buscar(this.sku()));
  protected readonly lista = computed(() => this.inventario.movimientos(this.sku()));
  protected readonly textoApartados = computed(() => (this.producto()?.apartados ?? []).map((a) => `${a.folio} (${a.cantidad})`).join(', '));

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    this.cerrar.emit();
  }
}
