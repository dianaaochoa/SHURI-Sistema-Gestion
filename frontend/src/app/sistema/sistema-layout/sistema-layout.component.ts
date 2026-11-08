import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { VistaImpresionComponent } from '../../cajera/documentos/vista-impresion/vista-impresion.component';
import { MenuLateralComponent } from '../menu-lateral/menu-lateral.component';

/** Estructura de la app del personal: menú lateral + contenido con scroll propio. */
@Component({
  selector: 'app-sistema-layout',
  standalone: true,
  imports: [RouterOutlet, MenuLateralComponent, VistaImpresionComponent],
  template: `
    <div class="sistema">
      <app-menu-lateral [abiertoMovil]="menuMovil()" (cerrar)="menuMovil.set(false)" />
      @if (menuMovil()) {
        <div class="sistema__fondo" (click)="menuMovil.set(false)"></div>
      }

      <div class="sistema__columna">
        <header class="barra-movil">
          <button type="button" class="barra-movil__boton" aria-label="Abrir menú" (click)="menuMovil.set(true)">
            <span></span><span></span><span></span>
          </button>
          <strong>SHURI</strong>
        </header>
        <main class="sistema__contenido">
          <router-outlet />
          <app-vista-impresion />
        </main>
      </div>
    </div>
  `,
  styles: `
    .sistema { display: flex; height: 100vh; overflow: hidden; }
    .sistema__columna { display: flex; flex: 1; flex-direction: column; min-width: 0; }
    .sistema__contenido { flex: 1; padding: 24px; overflow-y: auto; }
    .sistema__fondo { position: fixed; inset: 0; z-index: 15; background: rgba(23, 55, 78, 0.4); }
    .barra-movil { display: none; }

    @media (max-width: 768px) {
      .sistema__contenido { padding: 16px; }
      .barra-movil {
        display: flex; align-items: center; gap: 12px; height: 56px; padding: 0 16px;
        background: var(--color-marino); color: var(--color-superficie); font-size: 16px;
      }
      .barra-movil__boton {
        display: flex; flex-direction: column; justify-content: center; gap: 4px;
        width: 36px; height: 36px; padding: 0 8px; border: 0; border-radius: 8px;
        background: var(--color-marino-activo); cursor: pointer;
      }
      .barra-movil__boton span { height: 2px; border-radius: 1px; background: var(--color-superficie); }
    }
  `,
})
export class SistemaLayoutComponent {
  protected readonly menuMovil = signal(false);
}
