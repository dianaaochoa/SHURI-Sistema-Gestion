import { Component, computed, input } from '@angular/core';
import { generarQr } from './qr';

/** Código QR en SVG (con su margen blanco de 4 módulos), para tickets y hojas impresas. */
@Component({
  selector: 'app-qr',
  standalone: true,
  template: `
    @if (dibujo(); as d) {
      <svg [attr.viewBox]="'0 0 ' + d.lado + ' ' + d.lado" [attr.width]="tamano()" [attr.height]="tamano()" shape-rendering="crispEdges" role="img" [attr.aria-label]="'Código QR: ' + texto()">
        <rect [attr.width]="d.lado" [attr.height]="d.lado" fill="#fff" />
        <path [attr.d]="d.ruta" fill="#000" />
      </svg>
    }
  `,
  styles: `:host { display: inline-flex; } svg { display: block; }`,
})
export class QrComponent {
  readonly texto = input.required<string>();
  readonly tamano = input(88);

  protected readonly dibujo = computed(() => {
    const matriz = generarQr(this.texto());
    const margen = 4;
    let ruta = '';
    matriz.forEach((fila, y) => fila.forEach((oscuro, x) => (ruta += oscuro ? `M${x + margen} ${y + margen}h1v1h-1z` : '')));
    return { lado: matriz.length + margen * 2, ruta };
  });
}
