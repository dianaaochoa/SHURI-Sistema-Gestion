import { Component, HostListener, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { formatearDinero } from '../../../compartido/formato';
import { CajaService } from '../../caja.service';
import { Pedido, redondear } from '../inventario.datos';

/** C7.6 · Pago al proveedor en efectivo de caja (modal). */
@Component({
  selector: 'app-pago-proveedor',
  standalone: true,
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <section class="modal pago" role="dialog" aria-modal="true" aria-labelledby="titulo-pago" (click)="$event.stopPropagation()">
        <header class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-pago">Pago a proveedor{{ pedido() ? ' · ' + pedido()!.folio : '' }}</h2>
            <p class="modal__subtitulo">Se descuenta del efectivo de {{ nombreCaja }} y queda en el corte del turno</p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()">
            <img src="assets/inventario/x.svg" width="20" height="20" alt="" />
          </button>
        </header>

        <div class="cuadro cuadro--fondo">
          <p class="renglon"><span>Proveedor</span><strong>{{ proveedor() }}</strong></p>
          <p class="renglon"><span>{{ documento().startsWith('REM') ? 'Remisión' : 'Factura' }}</span><strong>{{ documento() }}</strong></p>
          @if (pedido(); as p) {
            <p class="renglon"><span>Pedido del jefe</span><strong>{{ p.folio }} · {{ p.jefe }}</strong></p>
          }
          <p class="renglon renglon--total"><span>Total a pagar</span><strong>{{ dinero(total()) }}</strong></p>
        </div>

        <div class="campos">
          <div class="campo">
            <label class="campo__etiqueta" for="pago-con">Paga con</label>
            <div class="campo__control campo__control--40">
              <select id="pago-con" class="campo__input campo__select"><option>Efectivo de caja</option></select>
              <img src="assets/cajera/chev-d.svg" width="16" height="16" alt="" />
            </div>
          </div>
          <div class="campo">
            <label class="campo__etiqueta" for="pago-entregado">Entregado al repartidor</label>
            <div class="campo__control campo__control--40" [class.campo__control--error]="error()">
              <span class="moneda">$</span>
              <input id="pago-entregado" class="campo__input" type="number" inputmode="decimal" min="0" step="0.01" [value]="entregado()" (input)="entregado.set(+$any($event.target).value)" (keydown.enter)="confirmarPago()" />
            </div>
          </div>
        </div>
        @if (error(); as e) { <p class="campo__error">{{ e }}</p> }

        <div class="cuadro">
          <p class="renglon"><span>Efectivo en caja antes</span><strong>{{ dinero(antes()) }}</strong></p>
          <p class="renglon"><span>Pago a proveedor</span><strong>− {{ dinero(total()) }}</strong></p>
          <p class="renglon"><span>Cambio recibido</span><strong>{{ dinero(cambio()) }}</strong></p>
          <p class="renglon"><span>Efectivo en caja después</span><strong class="fuerte">{{ dinero(antes() - total()) }}</strong></p>
        </div>

        <p class="aviso aviso--info">
          <img src="assets/pdv/receipt-primario.svg" width="16" height="16" alt="" />
          Este pago no cuenta como retiro a gerencia: en el corte aparece en “Pagos a proveedor” con su {{ documento().startsWith('REM') ? 'remisión' : 'factura' }}.
        </p>

        <div class="modal__acciones">
          <button type="button" class="boton boton--contorno boton--44" (click)="cerrar.emit()">Cancelar</button>
          <button type="button" class="boton boton--primario boton--44" (click)="confirmarPago()">
            <img src="assets/inventario/printer-blanco.svg" width="16" height="16" alt="" />Confirmar pago e imprimir
          </button>
        </div>
      </section>
    </div>
  `,
  styles: `
    .pago { max-width: 540px; }
    .cuadro { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--color-borde); border-radius: 8px; }
    .cuadro--fondo { border-color: transparent; background: var(--color-fondo); }
    .renglon { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--color-texto-tenue); }
    .renglon strong { font-weight: 600; text-align: right; color: var(--color-marino); }
    .renglon--total { align-items: center; }
    .renglon--total strong { font-size: 16px; font-weight: 700; }
    .renglon .fuerte { font-weight: 700; }
    .campos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .campo__control { gap: 8px; }
    .moneda { font-size: 14px; color: var(--color-texto-tenue); }
    @media (max-width: 480px) { .campos { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class PagoProveedorComponent implements OnInit {
  private readonly caja = inject(CajaService);
  readonly proveedor = input.required<string>();
  readonly documento = input.required<string>();
  readonly pedido = input<Pedido | null>(null);
  readonly total = input.required<number>();
  readonly cerrar = output<void>();
  /** Lo que se le dio al repartidor (el cambio se calcula con el total). */
  readonly confirmar = output<number>();

  protected readonly dinero = formatearDinero;
  protected readonly nombreCaja = this.caja.turno()?.caja ?? this.caja.cajas[0];
  protected readonly antes = this.caja.efectivoEnCaja;
  protected readonly entregado = signal(0);
  protected readonly cambio = computed(() => Math.max(0, redondear(this.entregado() - this.total())));
  protected readonly intentado = signal(false);

  protected readonly error = computed(() => {
    if (!this.intentado()) return null;
    if (!(this.entregado() >= this.total())) return `Debe ser al menos ${formatearDinero(this.total())}`;
    if (this.entregado() > this.antes()) return `En caja solo hay ${formatearDinero(this.antes())}`;
    return null;
  });

  ngOnInit(): void {
    // Lo usual: billetes cerrados (de $394.40 se entregan $400.00).
    this.entregado.set(Math.min(Math.ceil(this.total() / 50) * 50, this.antes()));
  }

  protected confirmarPago(): void {
    this.intentado.set(true);
    if (this.error()) return;
    this.confirmar.emit(this.entregado());
  }

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    this.cerrar.emit();
  }
}
