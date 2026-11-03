import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { iniciales } from '../navegacion';

/** Desplegable del avatar (Figma: componente "Menú de usuario"). */
@Component({
  selector: 'app-menu-usuario',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="popover menu-usuario" role="menu">
      <div class="menu-usuario__encabezado">
        <span class="avatar">{{ iniciales() }}</span>
        <span class="menu-usuario__nombre">
          <strong>{{ sesion()?.nombre }}</strong>
          <span>{{ sesion()?.puesto }} · {{ sesion()?.usuario }}</span>
        </span>
      </div>
      <hr />
      <a class="menu-usuario__opcion" role="menuitem" [routerLink]="prefijo() + '/perfil'" (click)="elegir.emit()">
        <img src="assets/menu/user.svg" width="18" height="18" alt="" />Mi perfil
      </a>
      <a class="menu-usuario__opcion" role="menuitem" [routerLink]="prefijo() + '/cambiar-contrasena'" (click)="elegir.emit()">
        <img src="assets/menu/key.svg" width="18" height="18" alt="" />Cambiar contraseña
      </a>
      <hr />
      <button type="button" class="menu-usuario__opcion menu-usuario__opcion--peligro" role="menuitem" (click)="cerrarSesion.emit()">
        <img src="assets/menu/logout.svg" width="18" height="18" alt="" />Cerrar sesión
      </button>
    </div>
  `,
  styles: `
    .menu-usuario { width: 240px; padding: 8px 0; }
    .menu-usuario__encabezado { display: flex; align-items: center; gap: 10px; padding: 8px 16px 12px; }
    .menu-usuario__nombre { display: flex; flex-direction: column; min-width: 0; font-size: 12px; color: var(--color-texto-tenue); }
    .menu-usuario__nombre strong { font-size: 13px; font-weight: 600; color: var(--color-marino); }
    hr { margin: 0; border: 0; border-top: 1px solid var(--color-borde); }
    .menu-usuario__opcion {
      display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 16px;
      border: 0; background: none; font-size: 13px; font-weight: 500; text-align: left;
      color: var(--color-marino); text-decoration: none; cursor: pointer;
    }
    .menu-usuario__opcion:hover { background: var(--color-fondo); }
    .menu-usuario__opcion--peligro { color: var(--color-peligro); }
  `,
})
export class MenuUsuarioComponent {
  readonly prefijo = input.required<string>();
  readonly elegir = output<void>();
  readonly cerrarSesion = output<void>();

  protected readonly sesion = inject(AuthService).sesion;
  protected readonly iniciales = computed(() => iniciales(this.sesion()?.nombre ?? ''));
}
