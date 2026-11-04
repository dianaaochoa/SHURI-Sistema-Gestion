import { Component, HostListener, OnInit, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { formatearDinero } from '../../../compartido/formato';
import { redondear } from '../../punto-de-venta/venta.service';
import { Devolucion, FormaReembolso, VentaRegistrada, devueltas, importeDevolucion } from '../historial-ventas.service';

const MOTIVOS = ['Producto defectuoso', 'No era compatible', 'Cambió de opinión', 'Error en el cobro', 'Otro'];

/** Estado del producto devuelto y qué pasa con el inventario. */
const ESTADOS_PRODUCTO = [
  { texto: 'Defectuoso · a proveedor', inventario: 'No regresa a venta (defectuoso)' },
  { texto: 'Buen estado · regresa a venta', inventario: 'Regresa a venta' },
  { texto: 'Abierto · revisar antes de vender', inventario: 'Se revisa antes de venderse' },
];

const FORMAS: { id: FormaReembolso; etiqueta: string; icono: string }[] = [
  { id: 'efectivo', etiqueta: 'Efectivo', icono: 'assets/pdv/cash.svg' },
  { id: 'tarjeta', etiqueta: 'A la misma tarjeta', icono: 'assets/pdv/card.svg' },
  { id: 'nota', etiqueta: 'Nota de crédito', icono: 'assets/ventas/ticket.svg' },
  { id: 'cambio', etiqueta: 'Cambio por otro', icono: 'assets/pdv/transfer.svg' },
];

/** C3.3 · Devolución de venta (modal). */
@Component({
  selector: 'app-devolucion',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <section class="modal devolucion" role="dialog" aria-modal="true" aria-labelledby="titulo-devolucion" (click)="$event.stopPropagation()">
        <header class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-devolucion">Devolución · Ticket {{ venta().folio }}</h2>
            <p class="modal__subtitulo">Compra del {{ fechaCompra() }} · {{ venta().cliente.nombre }} · {{ pagoTexto() }}</p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()">
            <img src="assets/pdv/x.svg" width="20" height="20" alt="" />
          </button>
        </header>

        <div class="articulos" role="table" aria-label="Artículos de la venta">
          <div class="articulos__fila articulos__encabezado" role="row">
            <span role="columnheader"></span>
            <span role="columnheader">Artículo</span>
            <span role="columnheader" class="articulos__cantidad">Cantidad a devolver</span>
            <span role="columnheader" class="articulos__importe">Importe</span>
          </div>
          @for (linea of filas(); track linea.sku) {
            <div class="articulos__fila" role="row" [class.articulos__fila--elegida]="linea.elegidas > 0">
              <label class="casilla" role="cell">
                <input
                  type="checkbox"
                  [checked]="linea.elegidas > 0"
                  [disabled]="!linea.disponibles"
                  [attr.aria-label]="'Devolver ' + linea.nombre"
                  (change)="alternar(linea.sku, linea.disponibles)"
                />
              </label>
              <span role="cell" class="articulos__nombre">
                {{ linea.nombre }} · {{ linea.sku }}
                @if (!linea.disponibles) {
                  <span class="estado estado--neutro">Ya devuelto</span>
                }
              </span>
              <span role="cell" class="articulos__cantidad paso">
                <button type="button" aria-label="Uno menos" [disabled]="linea.elegidas === 0" (click)="fijar(linea.sku, linea.elegidas - 1, linea.disponibles)">−</button>
                <strong>{{ linea.elegidas }} de {{ linea.disponibles }}</strong>
                <button type="button" aria-label="Uno más" [disabled]="linea.elegidas >= linea.disponibles" (click)="fijar(linea.sku, linea.elegidas + 1, linea.disponibles)">+</button>
              </span>
              <strong role="cell" class="articulos__importe">{{ dinero(linea.importe) }}</strong>
            </div>
          }
        </div>

        <div class="devolucion__fila">
          <div class="campo">
            <label class="campo__etiqueta" for="motivo-devolucion">Motivo de la devolución *</label>
            <div class="campo__control campo__control--40">
              <select id="motivo-devolucion" class="campo__input campo__select" [(ngModel)]="motivo">
                @for (m of motivos; track m) {
                  <option [value]="m">{{ m }}</option>
                }
              </select>
              <img src="assets/cajera/chev-d.svg" width="16" height="16" alt="" />
            </div>
          </div>
          <div class="campo">
            <label class="campo__etiqueta" for="estado-producto">Estado del producto *</label>
            <div class="campo__control campo__control--40">
              <select id="estado-producto" class="campo__input campo__select" [ngModel]="estadoProducto()" (ngModelChange)="estadoProducto.set($event)">
                @for (e of estadosProducto; track e.texto) {
                  <option [value]="e.texto">{{ e.texto }}</option>
                }
              </select>
              <img src="assets/cajera/chev-d.svg" width="16" height="16" alt="" />
            </div>
          </div>
        </div>

        <p class="campo__etiqueta" id="forma-reembolso">Forma de reembolso</p>
        <div class="selector" role="radiogroup" aria-labelledby="forma-reembolso">
          @for (opcion of formas; track opcion.id) {
            <button
              type="button"
              role="radio"
              class="selector__opcion"
              [class.selector__opcion--elegida]="opcion.id === forma()"
              [attr.aria-checked]="opcion.id === forma()"
              [disabled]="opcion.id === 'tarjeta' && !pagoConTarjeta()"
              [attr.title]="opcion.id === 'tarjeta' && !pagoConTarjeta() ? 'La venta no se pagó con tarjeta' : null"
              (click)="forma.set(opcion.id)"
            >
              <span class="icono" [style.--icono]="'url(' + opcion.icono + ')'"></span>
              {{ opcion.etiqueta }}
            </button>
          }
        </div>

        <div class="resumen">
          <p class="resumen__fila"><span>Artículos a devolver</span><strong>{{ piezas() }}</strong></p>
          <p class="resumen__fila"><span>Inventario</span><strong>{{ inventario() }}</strong></p>
          <p class="resumen__fila resumen__total"><span>Total a reembolsar</span><strong>{{ dinero(total()) }}</strong></p>
        </div>

        <p class="aviso aviso--advertencia">
          <img src="assets/ventas/alert-advertencia.svg" width="16" height="16" alt="" />
          Se imprime un comprobante de devolución y la venta queda como “{{ completa() ? 'Devuelta' : 'Devolución parcial' }}”.
        </p>

        <div class="modal__acciones">
          <button type="button" class="boton boton--contorno boton--44" (click)="cerrar.emit()">Cancelar</button>
          <button type="button" class="boton boton--primario boton--44" [disabled]="piezas() === 0" (click)="confirmarDevolucion()">
            <img src="assets/ventas/undo-blanco.svg" width="16" height="16" alt="" />Reembolsar e imprimir comprobante
          </button>
        </div>
      </section>
    </div>
  `,
  styles: `
    .devolucion { gap: 12px; max-width: 720px; }
    .articulos { overflow: hidden; border: 1px solid var(--color-borde); border-radius: 8px; }
    .articulos__fila { display: grid; grid-template-columns: 28px minmax(0, 1fr) 150px 90px; gap: 8px; align-items: center; min-height: 46px; padding: 0 16px; border-top: 1px solid var(--color-borde); font-size: 12px; color: var(--color-marino); }
    .articulos__encabezado { min-height: 40px; border-top: 0; background: var(--color-fondo); font-size: 11px; font-weight: 600; color: var(--color-texto-secundario); }
    .articulos__fila--elegida { background: var(--color-primario-suave); }
    .articulos__nombre { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .articulos__cantidad { justify-self: center; }
    .articulos__importe { justify-self: end; font-weight: 600; }
    .paso { display: flex; align-items: center; gap: 8px; }
    .paso strong { min-width: 40px; font-weight: 600; text-align: center; }
    .paso button { width: 22px; height: 22px; padding: 0; border: 0; border-radius: 999px; background: var(--color-primario-suave); font: 600 13px var(--fuente); color: var(--color-primario); cursor: pointer; }
    .paso button:disabled { opacity: 0.4; cursor: not-allowed; }
    .devolucion__fila { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .resumen { display: flex; flex-direction: column; gap: 8px; padding: 12px 16px; border-radius: 8px; background: var(--color-fondo); }
    .resumen__fila { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--color-texto-tenue); }
    .resumen__fila strong { font-weight: 600; color: var(--color-marino); }
    .resumen__total span { font-weight: 600; color: var(--color-marino); }
    .resumen__total strong { font-size: 22px; font-weight: 700; }
    .aviso--advertencia { align-items: center; }
    @media (max-width: 640px) {
      .articulos__fila { grid-template-columns: 24px minmax(0, 1fr) auto; padding: 8px 12px; }
      .articulos__importe { display: none; }
      .devolucion__fila { grid-template-columns: minmax(0, 1fr); }
      .selector { grid-auto-flow: row; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  `,
})
export class DevolucionComponent implements OnInit {
  readonly venta = input.required<VentaRegistrada>();
  readonly cerrar = output<void>();
  readonly confirmar = output<Devolucion>();

  protected readonly dinero = formatearDinero;
  protected readonly motivos = MOTIVOS;
  protected readonly estadosProducto = ESTADOS_PRODUCTO;
  protected readonly formas = FORMAS;

  protected motivo = MOTIVOS[0];
  protected readonly estadoProducto = signal(ESTADOS_PRODUCTO[0].texto);
  protected readonly forma = signal<FormaReembolso>('efectivo');
  /** Piezas elegidas por SKU. */
  private readonly elegidas = signal<Record<string, number>>({});

  protected readonly pagoConTarjeta = computed(() => {
    const v = this.venta();
    return v.metodo === 'tarjeta' || (v.partes ?? []).some((p) => p.metodo === 'tarjeta');
  });

  protected readonly filas = computed(() => {
    const v = this.venta();
    const elegidas = this.elegidas();
    return v.lineas.map((l) => {
      const cantidad = elegidas[l.sku] ?? 0;
      return { sku: l.sku, nombre: l.nombre, disponibles: l.cantidad - devueltas(v, l.sku), elegidas: cantidad, importe: importeDevolucion(v, l.sku, cantidad) };
    });
  });

  protected readonly piezas = computed(() => this.filas().reduce((suma, f) => suma + f.elegidas, 0));
  protected readonly total = computed(() => redondear(this.filas().reduce((suma, f) => suma + f.importe, 0)));
  protected readonly completa = computed(() => this.filas().every((f) => f.elegidas >= f.disponibles));
  protected readonly inventario = computed(() => ESTADOS_PRODUCTO.find((e) => e.texto === this.estadoProducto())!.inventario);

  ngOnInit(): void {
    // Se reembolsa por la misma vía cuando se puede (tarjeta), si no en efectivo.
    if (this.venta().metodo === 'tarjeta') this.forma.set('tarjeta');
  }

  protected fechaCompra(): string {
    const fecha = new Date(this.venta().fecha);
    return `${fecha.getDate()} ${fecha.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;
  }

  protected pagoTexto(): string {
    const metodo = this.venta().metodo;
    return metodo === 'mixto' ? 'Pago mixto' : `Pagó ${metodo === 'efectivo' ? 'en efectivo' : metodo === 'tarjeta' ? 'con tarjeta' : 'por transferencia'}`;
  }

  protected alternar(sku: string, disponibles: number): void {
    const actual = this.elegidas()[sku] ?? 0;
    this.fijar(sku, actual > 0 ? 0 : disponibles, disponibles);
  }

  protected fijar(sku: string, cantidad: number, disponibles: number): void {
    this.elegidas.update((e) => ({ ...e, [sku]: Math.max(0, Math.min(disponibles, cantidad)) }));
  }

  protected confirmarDevolucion(): void {
    if (this.piezas() === 0) return;
    this.confirmar.emit({
      fecha: new Date().toISOString(),
      articulos: this.filas()
        .filter((f) => f.elegidas > 0)
        .map((f) => ({ sku: f.sku, cantidad: f.elegidas })),
      monto: this.total(),
      forma: this.forma(),
      motivo: this.motivo,
      estadoProducto: this.estadoProducto(),
    });
  }

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    this.cerrar.emit();
  }
}
