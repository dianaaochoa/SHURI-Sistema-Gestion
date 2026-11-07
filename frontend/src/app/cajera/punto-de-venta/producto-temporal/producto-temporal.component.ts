import { AfterViewInit, Component, ElementRef, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { formatearDinero } from '../../../compartido/formato';
import { CATEGORIAS } from '../catalogo.datos';
import { ProductoTemporal } from '../venta.service';

/** C2.7 · Agregar producto temporal (modal): solo para esta venta, no entra al inventario. */
@Component({
  selector: 'app-producto-temporal',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <form
        class="modal temporal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-temporal"
        (click)="$event.stopPropagation()"
        (ngSubmit)="agregar()"
        novalidate
      >
        <header class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-temporal">Agregar producto temporal</h2>
            <p class="modal__subtitulo">Solo para esta venta. No se guarda en el inventario.</p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()">
            <img src="assets/pdv/x.svg" width="20" height="20" alt="" />
          </button>
        </header>

        <div class="campo">
          <label class="campo__etiqueta" for="tmp-nombre">Nombre o descripción *</label>
          <div class="campo__control campo__control--40" [class.campo__control--error]="intento() && !nombre().trim()">
            <input id="tmp-nombre" class="campo__input" autocomplete="off" [value]="nombre()" (input)="nombre.set($any($event.target).value)" />
          </div>
          @if (intento() && !nombre().trim()) {
            <span class="campo__error">Escribe qué estás vendiendo.</span>
          }
        </div>

        <div class="temporal__fila temporal__fila--3">
          <div class="campo">
            <label class="campo__etiqueta" for="tmp-cantidad">Cantidad *</label>
            <div class="campo__control campo__control--40" [class.campo__control--error]="intento() && cantidad() < 1">
              <input id="tmp-cantidad" class="campo__input" inputmode="numeric" [value]="cantidad()" (input)="cantidad.set(entero($any($event.target).value))" />
            </div>
          </div>
          <div class="campo">
            <label class="campo__etiqueta" for="tmp-precio">Precio de venta (IVA incl.) *</label>
            <div class="campo__control campo__control--40" [class.campo__control--error]="intento() && !precio()">
              <input id="tmp-precio" class="campo__input" inputmode="decimal" placeholder="$0.00" [value]="precio() ?? ''" (input)="precio.set(numero($any($event.target).value))" />
            </div>
            @if (intento() && !precio()) {
              <span class="campo__error">Escribe el precio.</span>
            }
          </div>
          <div class="campo">
            <label class="campo__etiqueta" for="tmp-costo">Costo (opcional)</label>
            <div class="campo__control campo__control--40">
              <input id="tmp-costo" class="campo__input" inputmode="decimal" placeholder="$0.00" [value]="costo() ?? ''" (input)="costo.set(numero($any($event.target).value))" />
            </div>
          </div>
        </div>

        <div class="temporal__fila">
          <div class="campo">
            <label class="campo__etiqueta" for="tmp-categoria">Categoría</label>
            <div class="campo__control campo__control--40">
              <select id="tmp-categoria" name="categoria" class="campo__input campo__select" [(ngModel)]="categoria">
                @for (opcion of categorias; track opcion) {
                  <option [value]="opcion">{{ opcion }}</option>
                }
              </select>
              <img src="assets/cajera/chev-d.svg" width="16" height="16" alt="" />
            </div>
          </div>
          <div class="campo">
            <span class="campo__etiqueta">Código (opcional)</span>
            <div class="campo__control campo__control--40 campo__control--fijo">{{ codigo() }}</div>
          </div>
        </div>

        <div class="campo">
          <label class="campo__etiqueta" for="tmp-nota">Nota para el ticket</label>
          <div class="campo__control campo__control--40">
            <input id="tmp-nota" name="nota" class="campo__input" autocomplete="off" [(ngModel)]="nota" />
          </div>
        </div>

        <label class="casilla">
          <input type="checkbox" name="alta" [(ngModel)]="darDeAlta" />
          Dar de alta en inventario después de la venta
        </label>

        <div class="temporal__importe">
          <span>Importe a agregar{{ margen() === null ? '' : ' · Margen ' + margen() + ' %' }}</span>
          <strong>{{ dinero(importe()) }}</strong>
        </div>

        <div class="modal__acciones">
          <button type="button" class="boton boton--contorno boton--44" (click)="cerrar.emit()">Cancelar</button>
          <button type="submit" class="boton boton--primario boton--44">
            <img src="assets/pdv/plus-blanco.svg" width="16" height="16" alt="" />Agregar a la venta
          </button>
        </div>
      </form>
    </div>
  `,
  styles: `
    .temporal { max-width: 600px; }
    .temporal__fila { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .temporal__fila--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .campo__control--fijo { font-size: 14px; color: var(--color-marino); }
    .temporal__importe {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 12px 16px; border-radius: 8px; background: var(--color-fondo);
      font-size: 13px; font-weight: 600; color: var(--color-texto-secundario);
    }
    .temporal__importe strong { font-size: 20px; color: var(--color-marino); }
    @media (max-width: 560px) {
      .temporal__fila, .temporal__fila--3 { grid-template-columns: 1fr; }
    }
  `,
})
export class ProductoTemporalComponent implements AfterViewInit {
  /** Código que tendrá el producto (TMP-0013). */
  readonly codigo = input.required<string>();
  /** Datos para precargar, p. ej. desde un producto sin disponibles (C2.3). */
  readonly nombreInicial = input('');
  readonly precioInicial = input<number | null>(null);

  readonly cerrar = output<void>();
  readonly agregado = output<ProductoTemporal>();

  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly categorias = CATEGORIAS;
  protected readonly dinero = formatearDinero;

  protected readonly nombre = signal('');
  protected readonly cantidad = signal(1);
  protected readonly precio = signal<number | null>(null);
  protected readonly costo = signal<number | null>(null);
  protected categoria = CATEGORIAS[0];
  protected nota = '';
  protected darDeAlta = false;
  protected readonly intento = signal(false);

  protected readonly importe = computed(() => (this.precio() ?? 0) * this.cantidad());
  /** Figma: "Margen 47 %" = (precio − costo) / precio. */
  protected readonly margen = computed(() => {
    const precio = this.precio();
    const costo = this.costo();
    return precio && costo !== null ? Math.round(((precio - costo) / precio) * 100) : null;
  });

  ngAfterViewInit(): void {
    this.nombre.set(this.nombreInicial());
    this.precio.set(this.precioInicial());
    this.elemento.nativeElement.querySelector<HTMLInputElement>(this.nombreInicial() ? '#tmp-cantidad' : '#tmp-nombre')?.focus();
  }

  entero(texto: string): number {
    return Math.max(0, Math.floor(Number(texto.replace(/\D/g, '')) || 0));
  }

  numero(texto: string): number | null {
    const limpio = texto.replace(/[^0-9.]/g, '');
    return limpio ? Number(limpio) : null;
  }

  agregar(): void {
    this.intento.set(true);
    const precio = this.precio();
    if (!this.nombre().trim() || this.cantidad() < 1 || !precio) return;
    this.agregado.emit({
      nombre: this.nombre().trim(),
      cantidad: this.cantidad(),
      precioConIva: precio,
      costo: this.costo(),
      categoria: this.categoria,
      nota: this.nota.trim(),
      darDeAlta: this.darDeAlta,
    });
  }

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    this.cerrar.emit();
  }
}
