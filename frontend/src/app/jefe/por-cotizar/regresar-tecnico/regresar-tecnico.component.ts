import { Component, input, output, signal } from '@angular/core';
import { Orden } from '../../../cajera/ordenes/ordenes.service';

/** J3.2 / J3.3 · "Regresar al técnico": la orden vuelve a Diagnóstico con la pregunta del jefe. */
@Component({
  selector: 'app-regresar-tecnico',
  standalone: true,
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <form class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-regresar" (click)="$event.stopPropagation()" (keydown.escape)="cerrar.emit()" (submit)="$event.preventDefault(); confirmar()">
        <div class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-regresar">Regresar al técnico · {{ orden().folio }}</h2>
            <p class="modal__subtitulo">{{ orden().tecnico.nombre }} recibe tu pregunta en su Inicio y la orden vuelve a “Diagnóstico”.</p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()"><img src="assets/inventario/x.svg" width="20" height="20" alt="" /></button>
        </div>
        <label class="campo">
          <span class="campo__etiqueta">Pregunta para el técnico *</span>
          <textarea class="texto" rows="3" maxlength="300" placeholder="¿Qué necesitas que revise o aclare?" [value]="pregunta()" (input)="pregunta.set($any($event.target).value)"></textarea>
        </label>
        <div class="modal__acciones">
          <button type="button" class="boton boton--contorno boton--44" (click)="cerrar.emit()">Cancelar</button>
          <button type="submit" class="boton boton--primario boton--44" [disabled]="!pregunta().trim()">Regresar al técnico</button>
        </div>
      </form>
    </div>
  `,
  styles: `
    .modal { max-width: 480px; }
    .texto { padding: 10px 12px; border: 1px solid var(--color-borde); border-radius: var(--radio-control); font: inherit; font-size: 14px; color: var(--color-marino); resize: vertical; }
    .texto:focus { border-color: var(--color-primario); outline: 0; }
  `,
})
export class RegresarTecnicoComponent {
  readonly orden = input.required<Orden>();
  readonly cerrar = output<void>();
  readonly enviar = output<string>();

  protected readonly pregunta = signal('');

  protected confirmar(): void {
    if (this.pregunta().trim()) this.enviar.emit(this.pregunta().trim());
  }
}
