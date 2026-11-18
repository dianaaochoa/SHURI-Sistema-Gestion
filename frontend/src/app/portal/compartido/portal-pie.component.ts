import { Component, signal } from '@angular/core';
import { NEGOCIO } from '../../cajera/documentos/documentos.service';
import { InformacionModalComponent } from './informacion-modal.component';

/** "Tu información está protegida" y el pie con ayuda, dirección y cláusulas (Figma P1.1, P1.3, P1.4). */
@Component({
  selector: 'app-portal-pie',
  standalone: true,
  imports: [InformacionModalComponent],
  template: `
    <p class="protegida"><span class="icono" style="--icono: url(assets/menu/shield.svg)"></span>Tu información está protegida <button type="button" class="enlace-texto" (click)="abierto.set('privacidad')">Aviso de privacidad</button></p>
    <footer>
      <a class="enlace-texto" [href]="'tel:' + telefono">¿Necesitas ayuda? Contacta al taller</a>
      <span>{{ negocio.direccionCorta }}</span>
      <button type="button" class="enlace-texto" (click)="abierto.set('clausulas')">Cláusulas y condiciones</button>
    </footer>
    @if (abierto(); as t) {
      <app-informacion-modal [tipo]="t" (cerrar)="abierto.set(null)" />
    }
  `,
  styles: [
    `:host { display: flex; flex-direction: column; gap: 40px; margin-top: auto; padding-top: 16px; }
    .protegida { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px; font-size: 12px; color: var(--color-texto-tenue); }
    .protegida .icono { width: 14px; height: 14px; color: var(--color-primario); }
    footer { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 11px; color: var(--color-texto-tenue); }
    .enlace-texto { padding: 0; border: 0; background: none; font: inherit; font-weight: 600; color: var(--color-primario); text-decoration: none; cursor: pointer; }
    .enlace-texto:hover { text-decoration: underline; }`,
  ],
})
export class PortalPieComponent {
  protected readonly negocio = NEGOCIO;
  protected readonly telefono = NEGOCIO.telefono.replace(/\s/g, '');
  protected readonly abierto = signal<'clausulas' | 'privacidad' | null>(null);
}
