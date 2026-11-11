import { Component, input, output } from '@angular/core';

/** Fotos del equipo (recepción, evidencia, reparación o salida). Son espacios vacíos hasta que existan las fotos reales. */
@Component({
  selector: 'app-fotos',
  standalone: true,
  template: `
    @for (n of lista(); track n) {
      <span class="foto-vacia" role="img" [attr.aria-label]="'Foto ' + n" [style.width.px]="tamano()" [style.height.px]="tamano()">
        <span class="icono" style="--icono: url(assets/tecnico/camara.svg)"></span>
      </span>
    }
    @if (agregar()) {
      <button type="button" class="foto-agregar" [style.width.px]="tamano()" [style.height.px]="tamano()" (click)="agregada.emit()">
        <span class="icono" style="--icono: url(assets/pdv/plus.svg)"></span>{{ agregar() }}
      </button>
    }
  `,
  styles: `
    :host { display: flex; flex-wrap: wrap; gap: 8px; }
    .foto-vacia .icono { width: 18px; height: 18px; color: var(--color-texto-tenue); }
    .foto-agregar .icono { width: 16px; height: 16px; }
  `,
})
export class FotosComponent {
  readonly cantidad = input(0);
  readonly tamano = input(72);
  /** Texto del botón para agregar ("Agregar", "Foto"); sin texto no se muestra. */
  readonly agregar = input('');
  readonly agregada = output<void>();

  protected lista(): number[] {
    return Array.from({ length: this.cantidad() }, (_, i) => i + 1);
  }
}
