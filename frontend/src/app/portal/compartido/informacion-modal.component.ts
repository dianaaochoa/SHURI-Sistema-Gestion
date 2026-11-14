import { Component, HostListener, input, output } from '@angular/core';
import { AVISO_PRIVACIDAD, CLAUSULAS_RECEPCION, llenarClausula, seccionesPrivacidad } from '../../compartido/ajustes-documentos';

/** P4.1 Cláusulas y condiciones · P4.3 Aviso de privacidad (hoja inferior; los textos salen de Configuración AD9.3). */
@Component({
  selector: 'app-informacion-modal',
  standalone: true,
  template: `
    <div class="fondo" (click)="cerrar.emit()">
      <div class="hoja" role="dialog" aria-modal="true" aria-labelledby="titulo-info" (click)="$event.stopPropagation()">
        <span class="asa" aria-hidden="true"></span>
        <div class="encabezado">
          <div>
            <h2 id="titulo-info">{{ tipo() === 'clausulas' ? 'Cláusulas y condiciones' : 'Aviso de privacidad' }}</h2>
            <p class="sub">{{ tipo() === 'clausulas' ? 'Contrato de servicio' + (folio() ? ' · Folio ' + folio() : '') : 'SHURI es responsable de tus datos personales' }}</p>
          </div>
          <button type="button" class="cerrar" aria-label="Cerrar" (click)="cerrar.emit()"><img src="assets/inventario/x.svg" width="20" height="20" alt="" /></button>
        </div>
        <div class="secciones">
          @for (s of tipo() === 'clausulas' ? clausulas : privacidad; track $index) {
            <section>
              @if (s.titulo) { <h3>{{ s.titulo }}</h3> }
              <p>{{ s.texto }}</p>
            </section>
          }
        </div>
        <button type="button" class="boton boton--primario boton--44" (click)="cerrar.emit()">Entendido</button>
      </div>
    </div>
  `,
  styles: [
    `.fondo { position: fixed; inset: 0; z-index: 60; display: flex; align-items: flex-end; justify-content: center; background: rgba(23, 55, 78, 0.45); }
    .hoja { display: flex; flex-direction: column; gap: 14px; width: 100%; max-width: 440px; max-height: 90dvh; padding: 10px 24px 24px; border-radius: 16px 16px 0 0; background: var(--color-superficie); }
    .asa { align-self: center; width: 40px; height: 4px; border-radius: 2px; background: var(--color-borde-control); }
    .encabezado { display: flex; justify-content: space-between; gap: 12px; }
    h2 { font-size: 22px; font-weight: 700; color: var(--color-marino); }
    .sub { font-size: 12px; color: var(--color-texto-tenue); }
    .cerrar { align-self: flex-start; padding: 0; border: 0; background: none; cursor: pointer; }
    .secciones { display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
    h3 { font-size: 13px; font-weight: 600; color: var(--color-marino); }
    p { font-size: 12px; color: var(--color-texto-tenue); }
    .boton { flex-shrink: 0; justify-content: center; }
    @media (min-width: 600px) { .fondo { align-items: center; } .hoja { border-radius: 16px; } }`,
  ],
})
export class InformacionModalComponent {
  readonly tipo = input.required<'clausulas' | 'privacidad'>();
  /** Folio de la orden, para el subtítulo del contrato. */
  readonly folio = input<string>('');
  readonly cerrar = output<void>();

  protected readonly clausulas = CLAUSULAS_RECEPCION.map((c, i) => ({ titulo: `${i + 1}. ${c.titulo}`, texto: llenarClausula(c.texto) }));
  protected readonly privacidad = seccionesPrivacidad(AVISO_PRIVACIDAD.texto);

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}
