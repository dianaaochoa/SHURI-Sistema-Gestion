import { Component, HostListener, input, output, signal } from '@angular/core';
import { Orden } from '../../../cajera/ordenes/ordenes.service';

const NECESIDADES = ['El PIN o patrón no funciona', 'Tiene cuenta Google / iCloud vinculada', 'Confirmar un daño que no se reportó', 'Autorizar borrado de datos', 'Otro'];

/** T3.8 · El técnico necesita un dato del cliente: la orden se pausa y el jefe le escribe por el chat del portal (J11). */
@Component({
  selector: 'app-necesito-info',
  standalone: true,
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <form class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-info" (click)="$event.stopPropagation()" (submit)="$event.preventDefault(); mandar()">
        <div class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-info">Necesito información del cliente · {{ orden().folio }}</h2>
            <p class="modal__subtitulo">La orden se pausa hasta tener respuesta. El jefe de técnicos le escribe al cliente por el chat del portal.</p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()"><img src="assets/inventario/x.svg" width="20" height="20" alt="" /></button>
        </div>
        <fieldset class="opciones">
          <legend class="campo__etiqueta">¿Qué necesitas? *</legend>
          @for (n of necesidades; track n) {
            <label class="opcion-radio" [class.opcion-radio--elegida]="n === tipo()">
              <input type="radio" name="necesidad" [checked]="n === tipo()" (change)="tipo.set(n)" />
              <span class="opcion-radio__texto"><strong>{{ n }}</strong></span>
            </label>
          }
        </fieldset>
        <label class="campo">
          <span class="campo__etiqueta">Mensaje para caja *</span>
          <textarea class="campo__area" rows="2" placeholder="Qué necesitas y para qué" [class.campo__area--error]="intentado() && !mensaje().trim()" [value]="mensaje()" (input)="mensaje.set($any($event.target).value)"></textarea>
          @if (intentado() && !mensaje().trim()) {
            <span class="campo__error">Escribe qué necesitas para que se lo pidan al cliente.</span>
          }
        </label>
        <p class="aviso aviso--advertencia"><span class="icono" style="--icono: url(assets/cajera/alert.svg)"></span>El cliente verá en su portal “Necesitamos un dato tuyo” y podrá responder por el chat.</p>
        <div class="modal__acciones">
          <button type="button" class="boton boton--contorno boton--44" (click)="cerrar.emit()">Cancelar</button>
          <button type="submit" class="boton boton--primario boton--44"><span class="icono" style="--icono: url(assets/iconos/send.svg)"></span>Pausar y avisar al jefe</button>
        </div>
      </form>
    </div>
  `,
  styleUrl: '../modal-banco.css',
})
export class NecesitoInfoComponent {
  readonly orden = input.required<Orden>();
  readonly cerrar = output<void>();
  readonly enviar = output<{ tipo: string; mensaje: string }>();

  protected readonly necesidades = NECESIDADES;
  protected readonly tipo = signal(NECESIDADES[0]);
  protected readonly mensaje = signal('');
  protected readonly intentado = signal(false);

  protected mandar(): void {
    this.intentado.set(true);
    if (this.mensaje().trim()) this.enviar.emit({ tipo: this.tipo(), mensaje: this.mensaje().trim() });
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}
