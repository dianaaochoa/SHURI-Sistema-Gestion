import { Component, input } from '@angular/core';

const PASOS = ['Recibido', 'Diagnóstico', 'Aprobación', 'En taller', 'Listo', 'Terminado'];

/** Seguimiento de 6 pasos del panel de la orden (Figma C4 · "Seguimiento"). */
@Component({
  selector: 'app-seguimiento-orden',
  standalone: true,
  template: `
    <ol class="pasos" [attr.aria-label]="'Paso ' + Math.min(paso(), 6) + ' de 6'">
      @for (nombre of pasos; track nombre; let i = $index) {
        <li class="paso" [class.paso--hecho]="i + 1 < paso()" [class.paso--actual]="i + 1 === paso()" [attr.aria-current]="i + 1 === paso() ? 'step' : null">
          <span class="paso__linea">
            <span class="paso__circulo">
              @if (i + 1 < paso()) {
                <img src="assets/ordenes/check-12.svg" width="12" height="12" alt="" />
              } @else {
                {{ i + 1 }}
              }
            </span>
          </span>
          <span class="paso__nombre">{{ nombre }}</span>
        </li>
      }
    </ol>
  `,
  styles: `
    .pasos { display: flex; margin: 0; padding: 0; list-style: none; }
    .paso { display: flex; flex: 1; flex-direction: column; align-items: center; gap: 6px; min-width: 0; }
    .paso__linea { position: relative; display: flex; justify-content: center; width: 100%; }
    .paso__linea::before, .paso__linea::after { content: ''; position: absolute; top: 10px; width: calc(50% - 11px); height: 2px; background: var(--color-borde); }
    .paso__linea::before { left: 0; }
    .paso__linea::after { right: 0; }
    .paso:first-child .paso__linea::before, .paso:last-child .paso__linea::after { visibility: hidden; }
    .paso--hecho .paso__linea::before, .paso--hecho .paso__linea::after, .paso--actual .paso__linea::before { background: var(--color-exito); }
    .paso__circulo { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: 1px solid var(--color-borde); border-radius: 999px; background: var(--color-fondo); font-size: 11px; font-weight: 600; color: var(--color-texto-tenue); }
    .paso--hecho .paso__circulo { border-color: var(--color-exito); background: var(--color-exito); }
    .paso--actual .paso__circulo { border-color: var(--color-primario); background: var(--color-primario); color: var(--color-superficie); }
    .paso__nombre { font-size: 11px; font-weight: 600; color: var(--color-texto-tenue); white-space: nowrap; }
    .paso--actual .paso__nombre { color: var(--color-primario); }
    @media (max-width: 420px) {
      .paso__nombre { font-size: 9px; }
    }
  `,
})
export class SeguimientoOrdenComponent {
  /** 1–6; 7 = todo terminado. */
  readonly paso = input.required<number>();
  protected readonly pasos = PASOS;
  protected readonly Math = Math;
}
