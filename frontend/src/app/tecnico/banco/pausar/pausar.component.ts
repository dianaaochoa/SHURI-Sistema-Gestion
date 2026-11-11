import { Component, HostListener, input, output, signal } from '@angular/core';
import { Orden } from '../../../cajera/ordenes/ordenes.service';

export const MOTIVOS_PAUSA = ['Esperando refacción', 'Comida / descanso', 'Atender otra orden urgente', 'Esperando respuesta del cliente', 'Otro'];

/** T3.6 · Pausar la orden: el cronómetro se detiene y el jefe ve el motivo. */
@Component({
  selector: 'app-pausar',
  standalone: true,
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <form class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-pausar" (click)="$event.stopPropagation()" (submit)="$event.preventDefault(); pausar.emit({ motivo: motivo(), nota: nota() })">
        <div class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-pausar">Pausar orden {{ orden().folio }}</h2>
            <p class="modal__subtitulo">El cronómetro se detiene y la orden queda marcada como “En pausa”</p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()"><img src="assets/inventario/x.svg" width="20" height="20" alt="" /></button>
        </div>
        <fieldset class="opciones">
          <legend class="campo__etiqueta">Motivo *</legend>
          @for (m of motivos; track m) {
            <label class="opcion-radio" [class.opcion-radio--elegida]="m === motivo()">
              <input type="radio" name="motivo" [checked]="m === motivo()" (change)="motivo.set(m)" />
              <span class="opcion-radio__texto"><strong>{{ m }}</strong></span>
            </label>
          }
        </fieldset>
        <label class="campo">
          <span class="campo__etiqueta">Nota (opcional)</span>
          <span class="campo__control campo__control--40">
            <input class="campo__input" placeholder="Ej. falta el adhesivo B-7000 (solicitud R-214)" [value]="nota()" (input)="nota.set($any($event.target).value)" />
          </span>
        </label>
        <p class="aviso aviso--info"><span class="icono" style="--icono: url(assets/cajera/clock.svg)"></span>El tiempo en pausa no cuenta en el tiempo de reparación. El jefe ve las órdenes en pausa y su motivo.</p>
        <div class="modal__acciones">
          <button type="button" class="boton boton--contorno boton--44" (click)="cerrar.emit()">Cancelar</button>
          <button type="submit" class="boton boton--primario boton--44"><span class="icono" style="--icono: url(assets/pdv/pause.svg)"></span>Pausar orden</button>
        </div>
      </form>
    </div>
  `,
  styleUrl: '../modal-banco.css',
})
export class PausarComponent {
  readonly orden = input.required<Orden>();
  readonly cerrar = output<void>();
  readonly pausar = output<{ motivo: string; nota: string }>();

  protected readonly motivos = MOTIVOS_PAUSA;
  protected readonly motivo = signal(MOTIVOS_PAUSA[0]);
  protected readonly nota = signal('');

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}
