import { Component, HostListener, inject, output, signal } from '@angular/core';
import { formatearDinero, formatearHora } from '../../compartido/formato';
import { CajaService } from '../caja.service';
import { VENTAS_EFECTIVO_DEMO } from '../inicio-cajera/inicio-cajera.datos';

/** C1.7 · Cerrar sesión con turno abierto (modal). */
@Component({
  selector: 'app-salir-con-turno',
  standalone: true,
  template: `
    <div class="modal-fondo" (click)="cancelar.emit()">
      <section
        class="modal salir"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-salir"
        (click)="$event.stopPropagation()"
      >
        <header class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-salir">Tienes un turno abierto</h2>
            <p class="modal__subtitulo">{{ detalle }}</p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cancelar.emit()">
            <img src="assets/cajera/x.svg" width="20" height="20" alt="" />
          </button>
        </header>

        <p class="salir__pregunta" id="pregunta-salir">Antes de salir, decide qué pasa con la caja:</p>

        <div class="salir__opciones" role="radiogroup" aria-labelledby="pregunta-salir">
          <label class="opcion" [class.opcion--elegida]="opcion() === 'corte'">
            <input type="radio" name="salida" value="corte" [checked]="opcion() === 'corte'" (change)="opcion.set('corte')" />
            <span>
              <strong>Cerrar turno y hacer corte</strong>
              <small>Recomendado al terminar tu jornada</small>
            </span>
          </label>
          <label class="opcion" [class.opcion--elegida]="opcion() === 'salir'">
            <input type="radio" name="salida" value="salir" [checked]="opcion() === 'salir'" (change)="opcion.set('salir')" />
            <span>
              <strong>Salir sin cerrar el turno</strong>
              <small>La caja sigue abierta a tu nombre; el siguiente usuario no podrá cobrar en ella</small>
            </span>
          </label>
        </div>

        <div class="modal__acciones">
          <button type="button" class="boton boton--contorno boton--44" (click)="cancelar.emit()">Cancelar</button>
          @if (opcion() === 'corte') {
            <button type="button" class="boton boton--primario boton--44" (click)="irACorte.emit()">
              <img src="assets/cajera/receipt-blanco.svg" width="16" height="16" alt="" />
              Ir a corte de caja
            </button>
          } @else {
            <button type="button" class="boton boton--primario boton--44" (click)="salirSinCerrar.emit()">
              Salir sin cerrar el turno
            </button>
          }
        </div>
      </section>
    </div>
  `,
  styles: `
    .salir { max-width: 520px; }
    .salir__pregunta { font-size: 13px; color: var(--color-texto-secundario); }
    .salir__opciones { display: flex; flex-direction: column; gap: 16px; }
    .opcion {
      display: flex; align-items: center; gap: 10px; padding: 10px 12px;
      border: 1px solid var(--color-borde); border-radius: 8px; cursor: pointer;
    }
    .opcion--elegida { background: var(--color-primario-suave); border-color: var(--color-primario); }
    .opcion input {
      appearance: none; flex-shrink: 0; width: 16px; height: 16px; margin: 0;
      border: 1.5px solid var(--color-menu-icono); border-radius: 999px; cursor: pointer;
    }
    .opcion input:checked { border: 5px solid var(--color-primario); }
    .opcion input:focus-visible { outline: 2px solid var(--color-acento); outline-offset: 2px; }
    .opcion span { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: var(--color-texto-tenue); }
    .opcion strong { font-size: 13px; font-weight: 400; color: var(--color-marino); }
    .opcion--elegida strong { font-weight: 600; }
  `,
})
export class SalirConTurnoComponent {
  readonly cancelar = output<void>();
  readonly irACorte = output<void>();
  readonly salirSinCerrar = output<void>();

  protected readonly opcion = signal<'corte' | 'salir'>('corte');

  private readonly turno = inject(CajaService).turno();
  /** "Caja 01 · desde las 09:00 · efectivo esperado $7,180.00" */
  protected readonly detalle = this.turno
    ? `${this.turno.caja} · desde las ${formatearHora(new Date(this.turno.desde))} · efectivo esperado ${formatearDinero(VENTAS_EFECTIVO_DEMO + this.turno.fondo)}`
    : '';

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    this.cancelar.emit();
  }
}
