import { Component, inject, signal } from '@angular/core';
import { NotificacionesService } from '../notificaciones.service';

/** Panel que abre la campana (Figma: T1.2 / J1.2 · Notificaciones). */
@Component({
  selector: 'app-panel-notificaciones',
  standalone: true,
  templateUrl: './panel-notificaciones.component.html',
  styleUrl: './panel-notificaciones.component.css',
})
export class PanelNotificacionesComponent {
  protected readonly notificaciones = inject(NotificacionesService);
  protected readonly pestana = signal<'nuevas' | 'todas'>('nuevas');
}
