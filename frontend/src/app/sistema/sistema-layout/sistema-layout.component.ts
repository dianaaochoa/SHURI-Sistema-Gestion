import { Component, computed, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { VistaImpresionComponent } from '../../cajera/documentos/vista-impresion/vista-impresion.component';
import { MenuLateralComponent } from '../menu-lateral/menu-lateral.component';
import { NavegacionMovilComponent } from '../navegacion-movil/navegacion-movil.component';
import { NotificacionesService } from '../notificaciones.service';
import { PanelNotificacionesComponent } from '../panel-notificaciones/panel-notificaciones.component';

/**
 * Estructura de la app del personal: menú lateral + contenido con scroll propio.
 * En celular, el jefe de técnicos tiene barra superior con campana y barra inferior (Figma J10);
 * los demás roles, la barra con ☰ que abre el cajón.
 */
@Component({
  selector: 'app-sistema-layout',
  standalone: true,
  imports: [RouterOutlet, MenuLateralComponent, VistaImpresionComponent, NavegacionMovilComponent, PanelNotificacionesComponent],
  template: `
    <div class="sistema" [class.sistema--jefe]="esJefe()">
      <app-menu-lateral [abiertoMovil]="menuMovil()" (cerrar)="menuMovil.set(false)" />
      @if (menuMovil()) {
        <div class="sistema__fondo" (click)="menuMovil.set(false)"></div>
      }

      <div class="sistema__columna">
        @if (esJefe()) {
          <header class="barra-movil barra-movil--jefe">
            <button type="button" class="barra-movil__marca" aria-label="Abrir menú completo" (click)="menuMovil.set(true)">
              <span class="barra-movil__logo"><img src="assets/acceso/logo-shuri.png" alt="" /></span>
              <span class="barra-movil__texto"><strong>SHURI</strong><span>Jefe de técnicos</span></span>
            </button>
            <button type="button" class="barra-movil__campana" [attr.aria-label]="'Notificaciones: ' + notificaciones.nuevas().length + ' nuevas'" [attr.aria-expanded]="avisos()" (click)="avisos.set(!avisos())">
              <span class="icono" style="--icono: url(assets/menu/bell.svg)"></span>
              @if (notificaciones.nuevas().length) {
                <span class="barra-movil__punto"></span>
              }
            </button>
          </header>
          @if (avisos()) {
            <div class="sistema__fondo sistema__fondo--claro" (click)="avisos.set(false)"></div>
            <app-panel-notificaciones class="avisos-movil" />
          }
        } @else {
          <header class="barra-movil">
            <button type="button" class="barra-movil__boton" aria-label="Abrir menú" (click)="menuMovil.set(true)">
              <span></span><span></span><span></span>
            </button>
            <strong>SHURI</strong>
          </header>
        }
        <main class="sistema__contenido">
          <router-outlet />
          <app-vista-impresion />
        </main>
      </div>
      @if (esJefe()) {
        <app-navegacion-movil />
      }
    </div>
  `,
  styles: `
    .sistema { display: flex; height: 100vh; overflow: hidden; }
    .sistema__columna { display: flex; flex: 1; flex-direction: column; min-width: 0; }
    .sistema__contenido { flex: 1; padding: 24px; overflow-y: auto; }
    .sistema__fondo { position: fixed; inset: 0; z-index: 15; background: rgba(23, 55, 78, 0.4); }
    .sistema__fondo--claro { z-index: 25; background: transparent; }
    .barra-movil { display: none; }

    @media (max-width: 768px) {
      .sistema__contenido { padding: 16px; }
      .sistema--jefe .sistema__contenido { padding-bottom: 80px; }
      .barra-movil {
        display: flex; flex-shrink: 0; align-items: center; gap: 12px; height: 56px; padding: 0 16px;
        background: var(--color-marino); color: var(--color-superficie); font-size: 16px;
      }
      .barra-movil__boton {
        display: flex; flex-direction: column; justify-content: center; gap: 4px;
        width: 36px; height: 36px; padding: 0 8px; border: 0; border-radius: 8px;
        background: var(--color-marino-activo); cursor: pointer;
      }
      .barra-movil__boton span { height: 2px; border-radius: 1px; background: var(--color-superficie); }

      /* Figma J10: logo, "SHURI · Jefe de técnicos" y campana */
      .barra-movil--jefe { justify-content: space-between; height: 64px; }
      .barra-movil__marca { display: flex; align-items: center; gap: 10px; padding: 0; border: 0; background: none; font: inherit; text-align: left; color: inherit; cursor: pointer; }
      .barra-movil__logo { display: flex; width: 32px; height: 32px; overflow: hidden; border-radius: 8px; background: var(--color-superficie); }
      .barra-movil__logo img { width: 100%; height: 100%; object-fit: contain; }
      .barra-movil__texto { display: flex; flex-direction: column; font-size: 10px; color: rgba(255, 255, 255, 0.7); }
      .barra-movil__texto strong { font-size: 14px; color: var(--color-superficie); }
      .barra-movil__campana { position: relative; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: 0; border-radius: 999px; background: var(--color-marino-activo); color: var(--color-superficie); cursor: pointer; }
      .barra-movil__campana .icono { width: 18px; height: 18px; }
      .barra-movil__punto { position: absolute; top: 6px; right: 7px; width: 8px; height: 8px; border-radius: 999px; background: var(--color-peligro); }
      .avisos-movil { position: fixed; top: 72px; right: 16px; left: 16px; z-index: 30; }
    }
  `,
})
export class SistemaLayoutComponent {
  protected readonly menuMovil = signal(false);
  protected readonly avisos = signal(false);
  protected readonly notificaciones = inject(NotificacionesService);
  private readonly sesion = inject(AuthService).sesion;
  protected readonly esJefe = computed(() => this.sesion()?.rol === 'jefe-tecnicos');
}
