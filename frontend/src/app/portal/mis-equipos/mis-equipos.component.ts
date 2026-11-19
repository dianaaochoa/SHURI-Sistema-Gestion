import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NEGOCIO } from '../../cajera/documentos/documentos.service';
import { InformacionModalComponent } from '../compartido/informacion-modal.component';
import { AvisoChatComponent } from '../chat/aviso-chat.component';
import { PortalService } from '../portal.service';
import { rutaLogo } from '../../compartido/ajustes-documentos';

/** P1.2 · Mis equipos: los equipos del cliente con su avance en 6 pasos. */
@Component({
  selector: 'app-mis-equipos',
  standalone: true,
  imports: [RouterLink, InformacionModalComponent, AvisoChatComponent],
  templateUrl: './mis-equipos.component.html',
  styleUrls: ['../portal.css', './mis-equipos.component.css'],
})
export class MisEquiposComponent {
  /** Logo de Configuración (AD9.1). */
  protected readonly logo = rutaLogo;
  private readonly portal = inject(PortalService);
  private readonly router = inject(Router);

  protected readonly cliente = this.portal.cliente;
  protected readonly clausulas = signal(false);
  protected readonly telefono = NEGOCIO.telefono.replace(/\s/g, '');
  protected readonly pasos = [1, 2, 3, 4, 5, 6];

  protected readonly equipos = computed(() =>
    this.portal.equipos().map((e) => ({ ...e, ruta: `/portal/equipo/${e.folio.replace('#', '')}` })),
  );

  /** P5 · “Contactar” abre el chat del primer equipo que sigue en el taller (si no hay, llama). */
  protected readonly chat = computed(() => {
    const e = this.portal.equipos().find((x) => x.orden);
    return e ? `/portal/chat/${e.folio.replace('#', '')}` : null;
  });

  protected readonly subtitulo = computed(() => {
    const n = this.equipos().length;
    const tel = this.cliente()?.telefono;
    return `${n} ${n === 1 ? 'equipo registrado' : 'equipos registrados'}${tel ? ` con tu teléfono ${tel}` : ''}`;
  });

  protected salir(): void {
    this.portal.cerrarSesion();
    this.router.navigateByUrl('/portal');
  }
}
