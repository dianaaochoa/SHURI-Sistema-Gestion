import { Component, HostListener, input, output } from '@angular/core';
import { AVISO_PRIVACIDAD, CLAUSULAS_RECEPCION, llenarClausula } from '../../compartido/ajustes-documentos';

/** Cláusulas y condiciones o aviso de privacidad (los mismos de Configuración AD9.3). P4 tendrá la página completa. */
@Component({
  selector: 'app-informacion-modal',
  standalone: true,
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-info" (click)="$event.stopPropagation()">
        <div class="modal__encabezado">
          <h2 class="modal__titulo" id="titulo-info">{{ tipo() === 'clausulas' ? 'Cláusulas y condiciones' : 'Aviso de privacidad' }}</h2>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()"><img src="assets/inventario/x.svg" width="20" height="20" alt="" /></button>
        </div>
        @if (tipo() === 'clausulas') {
          <ol class="lista">
            @for (c of clausulas; track $index) {
              <li><strong>{{ c.titulo }}.</strong> {{ c.texto }}</li>
            }
          </ol>
        } @else {
          <p class="texto">{{ privacidad }}</p>
        }
        <button type="button" class="boton boton--primario boton--44" (click)="cerrar.emit()">Entendido</button>
      </div>
    </div>
  `,
  styles: [
    `.modal { max-width: 480px; max-height: 85dvh; overflow-y: auto; }
    .lista { display: flex; flex-direction: column; gap: 10px; margin: 0; padding-left: 20px; font-size: 13px; color: var(--color-texto-secundario); }
    .lista strong { color: var(--color-marino); }
    .texto { font-size: 13px; color: var(--color-texto-secundario); }
    .boton { justify-content: center; }`,
  ],
})
export class InformacionModalComponent {
  readonly tipo = input.required<'clausulas' | 'privacidad'>();
  readonly cerrar = output<void>();

  protected readonly clausulas = CLAUSULAS_RECEPCION.map((c) => ({ titulo: c.titulo, texto: llenarClausula(c.texto) }));
  protected readonly privacidad = AVISO_PRIVACIDAD.texto;

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}
