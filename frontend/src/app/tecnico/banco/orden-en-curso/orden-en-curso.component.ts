import { Component, HostListener, input, output } from '@angular/core';
import { Orden } from '../../../cajera/ordenes/ordenes.service';

/** T3.11 · Solo se trabaja una orden a la vez: iniciar otra pausa la que va en curso. */
@Component({
  selector: 'app-orden-en-curso',
  standalone: true,
  template: `
    <div class="modal-fondo" (click)="volver.emit()">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-en-curso" (click)="$event.stopPropagation()">
        <div class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-en-curso">Ya tienes una orden en curso</h2>
            <p class="modal__subtitulo">Solo puedes trabajar una orden a la vez para que el tiempo sea exacto</p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="volver.emit()"><img src="assets/inventario/x.svg" width="20" height="20" alt="" /></button>
        </div>
        <div class="actual">
          <span class="actual__icono"><span class="icono" style="--icono: url(assets/menu/wrench.svg)"></span></span>
          <span class="actual__texto"><strong>{{ actual().folio }} · {{ actual().equipo }} · {{ actual().cliente.nombre }}</strong><span>En taller · cronómetro corriendo {{ tiempo() }}</span></span>
          <span class="estado estado--info">En curso</span>
        </div>
        <p class="texto">Si inicias {{ nueva() }}, la orden {{ actual().folio }} se pausará automáticamente con el motivo “Atender otra orden”.</p>
        <div class="modal__acciones">
          <button type="button" class="boton boton--contorno boton--44" (click)="irActual.emit()">Volver a {{ actual().folio }}</button>
          <button type="button" class="boton boton--primario boton--44" (click)="cambiar.emit()"><span class="icono" style="--icono: url(assets/pdv/play-blanco.svg)"></span>Pausar {{ actual().folio }} e iniciar {{ nueva() }}</button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .modal { max-width: 520px; }
    .actual { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--color-borde); border-radius: 8px; }
    .actual__icono { display: flex; flex-shrink: 0; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 8px; background: var(--color-primario-suave); color: var(--color-primario); }
    .actual__icono .icono { width: 18px; height: 18px; }
    .actual__texto { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; font-size: 11px; color: var(--color-texto-tenue); }
    .actual__texto strong { font-size: 13px; font-weight: 600; color: var(--color-marino); }
    .texto { font-size: 13px; color: var(--color-texto-secundario); }
    .boton .icono { width: 16px; height: 16px; }
    @media (max-width: 520px) { .modal__acciones .boton { flex: 1 1 100%; justify-content: center; } }
  `,
})
export class OrdenEnCursoComponent {
  readonly actual = input.required<Orden>();
  readonly nueva = input('');
  readonly tiempo = input('');
  /** Cerrar sin hacer nada. */
  readonly volver = output<void>();
  /** Ir al banco de la orden en curso. */
  readonly irActual = output<void>();
  readonly cambiar = output<void>();

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.volver.emit();
  }
}
