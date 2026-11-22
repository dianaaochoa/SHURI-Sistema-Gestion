import { Component, computed, inject, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { NAVEGACION } from '../navegacion';
import { NotificacionesService } from '../notificaciones.service';

/** Panel que abre la campana (Figma: T1.2 / J1.2 · Notificaciones). */
@Component({
  selector: 'app-panel-notificaciones',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './panel-notificaciones.component.html',
  styleUrl: './panel-notificaciones.component.css',
})
export class PanelNotificacionesComponent {
  protected readonly notificaciones = inject(NotificacionesService);
  protected readonly pestana = signal<'nuevas' | 'todas'>('nuevas');
  private readonly sesion = inject(AuthService).sesion;
  protected readonly prefijo = computed(() => NAVEGACION[this.sesion()?.rol ?? 'cajera'].prefijo);
  /** “Ver todas las notificaciones”: quien abrió el panel lo cierra. */
  readonly ir = output<void>();
}
