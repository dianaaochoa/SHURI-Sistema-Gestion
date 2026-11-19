import { Component } from '@angular/core';
import { rutaLogo } from '../../compartido/ajustes-documentos';

/** Logo, nombre y lema del taller arriba de las pantallas de acceso del portal (Figma P1). */
@Component({
  selector: 'app-portal-marca',
  standalone: true,
  template: `
    <img [src]="logo()" width="56" height="56" alt="" />
    <p class="nombre">SHURI</p>
    <p class="lema">Reparaciones y Ventas</p>
  `,
  styles: [
    `:host { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    img { margin-bottom: 8px; border-radius: 12px; }
    .nombre { font-size: 20px; font-weight: 700; color: var(--color-marino); }
    .lema { font-size: 13px; color: var(--color-texto-tenue); }`,
  ],
})
export class PortalMarcaComponent {
  protected readonly logo = rutaLogo;
}
