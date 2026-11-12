import { Component, HostListener, computed, input, output, signal } from '@angular/core';
import { formatearDinero } from '../../../compartido/formato';
import { redondear } from '../../punto-de-venta/venta.service';
import { Orden } from '../ordenes.service';

/** C4.2 · Registrar respuesta en mostrador (presupuesto) · también para el cargo adicional de C4.8. */
@Component({
  selector: 'app-respuesta-cliente',
  standalone: true,
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <section class="modal respuesta" role="dialog" aria-modal="true" aria-labelledby="titulo-respuesta" (click)="$event.stopPropagation()">
        <header class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-respuesta">{{ esAdicional() ? 'Respuesta sobre el cargo adicional' : 'Registrar respuesta en mostrador' }}</h2>
            <p class="modal__subtitulo">Folio {{ orden().folio }} · {{ orden().equipo }} · {{ orden().cliente.nombre }} · Total {{ dinero(totalPropuesto()) }}</p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()">
            <img src="assets/pdv/x.svg" width="20" height="20" alt="" />
          </button>
        </header>

        <div class="desglose">
          @if (esAdicional()) {
            <p class="desglose__fila"><span>Adicional</span><strong>{{ dinero(orden().adicional!.monto) }}</strong></p>
            <p class="desglose__fila"><span>Ya autorizado</span><strong>{{ dinero(orden().presupuesto!.total) }}</strong></p>
          } @else {
            <p class="desglose__fila"><span>Refacciones</span><strong>{{ dinero(orden().presupuesto!.refacciones) }}</strong></p>
            <p class="desglose__fila"><span>Mano de obra</span><strong>{{ dinero(orden().presupuesto!.manoObra) }}</strong></p>
            <p class="desglose__fila"><span>IVA 16 %</span><strong>{{ dinero(iva()) }}</strong></p>
          }
          <p class="desglose__fila desglose__total"><span>{{ esAdicional() ? 'Nuevo total' : 'Total' }}</span><strong>{{ dinero(totalPropuesto()) }}</strong></p>
        </div>

        <p class="campo__etiqueta" id="respuesta-cliente">Respuesta del cliente</p>
        <div class="selector" role="radiogroup" aria-labelledby="respuesta-cliente">
          <button type="button" role="radio" class="selector__opcion" [class.selector__opcion--elegida]="aprobo() === true" [attr.aria-checked]="aprobo() === true" (click)="aprobo.set(true)">
            <span class="icono" style="--icono: url(assets/ordenes/circulo-check.svg)"></span>Aprobó
          </button>
          <button type="button" role="radio" class="selector__opcion" [class.selector__opcion--elegida]="aprobo() === false" [attr.aria-checked]="aprobo() === false" (click)="aprobo.set(false)">
            <span class="icono" style="--icono: url(assets/ordenes/x-gris.svg)"></span>Rechazó
          </button>
        </div>

        <div class="campo">
          <label class="campo__etiqueta" for="nota-respuesta">Nota</label>
          <div class="campo__control campo__control--40">
            <input id="nota-respuesta" class="campo__input" autocomplete="off" placeholder="Ej. Confirmó por teléfono a las 18:20" [value]="nota()" (input)="nota.set($any($event.target).value)" />
          </div>
        </div>

        @if (aprobo() !== null) {
          <p class="aviso respuesta__aviso">
            <img src="assets/ordenes/circulo-check-16.svg" width="16" height="16" alt="" />
            {{ consecuencia() }}
          </p>
        }

        <div class="modal__acciones">
          <button type="button" class="boton boton--contorno boton--44" (click)="cerrar.emit()">Cancelar</button>
          <button type="button" class="boton boton--primario boton--44" [disabled]="aprobo() === null" (click)="guardarRespuesta()">
            <img src="assets/pdv/check-blanco.svg" width="16" height="16" alt="" />Guardar respuesta
          </button>
        </div>
      </section>
    </div>
  `,
  styles: `
    .respuesta { max-width: 600px; }
    .desglose { display: flex; flex-direction: column; gap: 6px; padding: 12px 16px; border-radius: 8px; background: var(--color-fondo); }
    .desglose__fila { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--color-texto-tenue); }
    .desglose__fila strong { font-weight: 600; color: var(--color-marino); }
    .desglose__total { margin-top: 2px; font-weight: 600; color: var(--color-marino); }
    .desglose__total strong { font-size: 20px; font-weight: 700; }
    .respuesta__aviso { background: var(--color-primario-suave); }
  `,
})
export class RespuestaClienteComponent {
  readonly orden = input.required<Orden>();
  /** Nombre de la cajera para el texto del portal. */
  readonly cajera = input('');
  readonly cerrar = output<void>();
  readonly guardar = output<{ aprobo: boolean; nota: string }>();

  protected readonly dinero = formatearDinero;
  protected readonly aprobo = signal<boolean | null>(null);
  protected readonly nota = signal('');

  protected readonly esAdicional = computed(() => this.orden().estado === 'adicional' && !!this.orden().adicional);
  protected readonly totalPropuesto = computed(() => {
    const o = this.orden();
    return this.esAdicional() ? redondear(o.presupuesto!.total + o.adicional!.monto) : o.presupuesto!.total;
  });
  protected readonly iva = computed(() => {
    const p = this.orden().presupuesto!;
    return redondear(p.total - p.refacciones - p.manoObra);
  });

  protected readonly consecuencia = computed(() => {
    const quien = this.cajera() || 'la sucursal';
    if (this.esAdicional()) {
      return this.aprobo()
        ? `Al guardar, el total de la orden sube a ${this.dinero(this.totalPropuesto())}, el técnico sigue con la reparación y el portal muestra “Adicional aprobado en sucursal por ${quien}”.`
        : 'Al guardar, el técnico sigue solo con lo ya autorizado y el portal muestra que el cliente rechazó el adicional.';
    }
    return this.aprobo()
      ? `Al guardar, la orden pasa a “En taller”, el técnico recibe el aviso y el portal del cliente muestra “Aprobado en sucursal por ${quien}”.`
      : 'Al guardar, la orden pasa a “Sin reparación”: el técnico arma el equipo y queda listo para que el cliente lo recoja.';
  });

  protected guardarRespuesta(): void {
    const aprobo = this.aprobo();
    if (aprobo === null) return;
    this.guardar.emit({ aprobo, nota: this.nota() });
  }

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    this.cerrar.emit();
  }
}
