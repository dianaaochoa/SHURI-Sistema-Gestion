import { Component, computed, input, model, signal } from '@angular/core';
import { formatearDinero } from '../../../compartido/formato';
import { MetodoSimple, ParteMixta, redondear } from '../venta.service';

const INFO: Record<MetodoSimple, { titulo: string; icono: string; referencia: string }> = {
  efectivo: { titulo: 'Efectivo', icono: 'cash-18', referencia: '' },
  tarjeta: { titulo: 'Tarjeta', icono: 'card-18', referencia: 'Terminal BBVA · Autorización' },
  transferencia: { titulo: 'Transferencia', icono: 'transfer-primario', referencia: 'Clave de rastreo' },
};

/** Pagado, restante y cambio de un cobro mixto. Solo el efectivo puede dar cambio. */
export function resumenMixto(partes: ParteMixta[], total: number) {
  const pagado = redondear(partes.reduce((suma, p) => suma + (p.monto ?? 0), 0));
  const efectivo = redondear(partes.filter((p) => p.metodo === 'efectivo').reduce((suma, p) => suma + (p.monto ?? 0), 0));
  const diferencia = redondear(total - pagado);
  const cambio = diferencia < 0 ? -diferencia : 0;
  const completas = partes.every((p) => (p.monto ?? 0) > 0 && (p.metodo === 'efectivo' || p.referencia.trim().length > 0));
  const cambioSinEfectivo = cambio > efectivo;
  return {
    pagado,
    restante: Math.max(0, diferencia),
    cambio,
    cambioSinEfectivo,
    valido: partes.length > 0 && completas && diferencia <= 0 && !cambioSinEfectivo,
  };
}

/** C2.13 · Cobro mixto: varias formas de pago en un mismo cobro (dentro del modal "Cobrar venta"). */
@Component({
  selector: 'app-pago-mixto',
  standalone: true,
  template: `
    @for (parte of partes(); track $index) {
      <div class="parte">
        <img [src]="'assets/pdv/' + info[parte.metodo].icono + '.svg'" width="18" height="18" alt="" />
        <div class="parte__texto">
          <strong>{{ info[parte.metodo].titulo }}</strong>
          @if (parte.metodo === 'efectivo') {
            <span>Recibido {{ dinero(parte.monto ?? 0) }} · Cambio {{ dinero(resumen().cambio) }}</span>
          } @else {
            <label class="parte__referencia">
              {{ info[parte.metodo].referencia }} *
              <input autocomplete="off" placeholder="Capturar" [value]="parte.referencia" (input)="cambiar($index, { referencia: $any($event.target).value })" />
            </label>
          }
        </div>
        <div class="campo__control campo__control--40 parte__monto">
          <input
            class="campo__input"
            [class.cobro__enfoque]="$first"
            inputmode="decimal"
            autocomplete="off"
            placeholder="$0.00"
            [attr.aria-label]="'Monto en ' + info[parte.metodo].titulo"
            [value]="parte.monto ?? ''"
            (focus)="alEnfocar($index)"
            (input)="cambiar($index, { monto: leerNumero($any($event.target).value) })"
          />
        </div>
        <button type="button" class="parte__quitar" [attr.aria-label]="'Quitar ' + info[parte.metodo].titulo" [disabled]="partes().length === 1" (click)="quitar($index)">
          <img src="assets/pdv/x-16.svg" width="16" height="16" alt="" />
        </button>
      </div>
    }

    @if (eligiendo()) {
      <div class="agregar">
        @for (metodo of metodosDisponibles(); track metodo) {
          <button type="button" class="boton boton--contorno agregar__opcion" (click)="agregar(metodo)">
            <img [src]="'assets/pdv/' + info[metodo].icono + '.svg'" width="16" height="16" alt="" />{{ info[metodo].titulo }}
          </button>
        }
      </div>
    } @else {
      <button type="button" class="enlace" (click)="eligiendo.set(true)">
        <img src="assets/pdv/plus-14-primario.svg" width="14" height="14" alt="" />Agregar otro método de pago
      </button>
    }

    <div class="resumen" [class.resumen--pendiente]="!resumen().valido" aria-live="polite">
      <p class="resumen__fila"><span>Pagado</span><strong>{{ dinero(resumen().pagado) }} de {{ dinero(total()) }}</strong></p>
      <p class="resumen__fila resumen__fila--grande">
        <span>{{ resumen().cambio > 0 ? 'Cambio a entregar' : 'Restante por cubrir' }}</span>
        <strong>{{ dinero(resumen().cambio > 0 ? resumen().cambio : resumen().restante) }}</strong>
      </p>
      @if (resumen().cambioSinEfectivo) {
        <p class="resumen__nota">Solo el efectivo puede dar cambio: ajusta el monto de tarjeta o transferencia.</p>
      }
    </div>
  `,
  styles: `
    :host { display: contents; }
    .parte { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--color-borde); border-radius: 8px; }
    .parte__texto { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; font-size: 11px; color: var(--color-texto-tenue); }
    .parte__texto strong { font-size: 13px; font-weight: 600; color: var(--color-marino); }
    .parte__referencia { display: flex; align-items: center; gap: 4px; }
    .parte__referencia input { width: 80px; min-width: 0; padding: 1px 4px; border: 0; border-bottom: 1px dashed var(--color-borde-control); font: inherit; color: var(--color-marino); }
    .parte__referencia input:focus { outline: none; border-bottom-color: var(--color-primario); }
    .parte__monto { flex-shrink: 0; width: 140px; }
    .parte__quitar { display: flex; padding: 0; border: 0; background: none; cursor: pointer; }
    .parte__quitar:disabled { opacity: 0.3; cursor: not-allowed; }
    .enlace { align-self: flex-start; gap: 6px; font-size: 12px; }
    .agregar { display: flex; flex-wrap: wrap; gap: 8px; }
    .agregar__opcion { height: 32px; padding: 0 12px; font-size: 12px; }
    .resumen { display: flex; flex-direction: column; gap: 8px; padding: 12px 16px; border-radius: 8px; background: var(--color-exito-suave); color: var(--color-exito); }
    .resumen--pendiente { background: var(--color-advertencia-suave); color: var(--color-advertencia); }
    .resumen__fila { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; }
    .resumen__fila strong { font-weight: 600; }
    .resumen__fila--grande span { font-weight: 600; }
    .resumen__fila--grande strong { font-size: 18px; font-weight: 700; }
    .resumen__nota { font-size: 11px; }
    @media (max-width: 560px) {
      .parte { flex-wrap: wrap; }
      .parte__texto { flex-basis: calc(100% - 30px); }
      .parte__monto { flex: 1; }
    }
  `,
})
export class PagoMixtoComponent {
  readonly total = input.required<number>();
  readonly enLinea = input(true);
  readonly partes = model.required<ParteMixta[]>();

  protected readonly info = INFO;
  protected readonly dinero = formatearDinero;
  protected readonly eligiendo = signal(false);
  protected readonly resumen = computed(() => resumenMixto(this.partes(), this.total()));
  /** Sin conexión no se aceptan transferencias (C2.16). */
  protected readonly metodosDisponibles = computed<MetodoSimple[]>(() =>
    this.enLinea() ? ['efectivo', 'tarjeta', 'transferencia'] : ['efectivo', 'tarjeta'],
  );

  protected leerNumero(texto: string): number | null {
    const limpio = texto.replace(/[^0-9.]/g, '');
    return limpio ? Number(limpio) : null;
  }

  protected cambiar(indice: number, cambios: Partial<ParteMixta>): void {
    this.partes.update((lista) => lista.map((p, i) => (i === indice ? { ...p, ...cambios } : p)));
  }

  /** Al entrar a un monto vacío, si ya se capturó otra parte, se propone lo que falta por cubrir. */
  protected alEnfocar(indice: number): void {
    const { restante, pagado } = this.resumen();
    if (this.partes()[indice].monto === null && pagado > 0 && restante > 0) this.cambiar(indice, { monto: restante });
  }

  protected agregar(metodo: MetodoSimple): void {
    this.partes.update((lista) => [...lista, { metodo, monto: null, referencia: '' }]);
    this.eligiendo.set(false);
  }

  protected quitar(indice: number): void {
    this.partes.update((lista) => lista.filter((_, i) => i !== indice));
  }
}
