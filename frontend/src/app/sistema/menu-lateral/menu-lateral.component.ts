import { Component, ElementRef, HostListener, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { MenuUsuarioComponent } from '../menu-usuario/menu-usuario.component';
import { NAVEGACION, iniciales } from '../navegacion';
import { NotificacionesService } from '../notificaciones.service';
import { PanelNotificacionesComponent } from '../panel-notificaciones/panel-notificaciones.component';

const CLAVE_CONTRAIDO = 'shuri.menu.contraido';
/** Regla de Figma: en 1366 × 768 o menos el menú se compacta a un riel de íconos de 72 px. */
const PANTALLA_COMPACTA = '(max-width: 1366px)';
/** En celular el menú es un cajón completo que se abre desde la barra superior. */
const PANTALLA_MOVIL = '(max-width: 768px)';

/** Menú lateral: 184 px en escritorio, riel de 72 px en pantallas compactas, cajón en celular. */
@Component({
  selector: 'app-menu-lateral',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, MenuUsuarioComponent, PanelNotificacionesComponent],
  templateUrl: './menu-lateral.component.html',
  styleUrl: './menu-lateral.component.css',
  host: { '[class.riel]': 'contraido()' },
})
export class MenuLateralComponent {
  /** Solo en celular: el menú se muestra como cajón. */
  readonly abiertoMovil = input(false);
  readonly cerrar = output<void>();

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly notificaciones = inject(NotificacionesService);

  protected readonly sesion = this.auth.sesion;
  protected readonly navegacion = computed(() => NAVEGACION[this.sesion()?.rol ?? 'cajera']);
  protected readonly iniciales = computed(() => iniciales(this.sesion()?.nombre ?? ''));

  private readonly preferencia = signal<boolean | null>(leerPreferencia());
  private readonly pantallaCompacta = signal(matchMedia(PANTALLA_COMPACTA).matches);
  private readonly pantallaMovil = signal(matchMedia(PANTALLA_MOVIL).matches);
  protected readonly contraido = computed(
    () => !this.pantallaMovil() && (this.preferencia() ?? this.pantallaCompacta()),
  );
  /** El riel se abre al pasar el mouse (sin mover el contenido). */
  protected readonly desplegado = signal(false);

  protected readonly abierto = signal<'usuario' | 'notificaciones' | null>(null);
  private readonly pie = viewChild.required<ElementRef<HTMLElement>>('pie');

  constructor() {
    matchMedia(PANTALLA_COMPACTA).addEventListener('change', (e) => this.pantallaCompacta.set(e.matches));
    matchMedia(PANTALLA_MOVIL).addEventListener('change', (e) => this.pantallaMovil.set(e.matches));
  }

  alternarContraido(): void {
    const valor = !this.contraido();
    this.preferencia.set(valor);
    this.desplegado.set(false);
    try {
      localStorage.setItem(CLAVE_CONTRAIDO, String(valor));
    } catch {
      // Sin almacenamiento solo se pierde la preferencia.
    }
  }

  alternar(popover: 'usuario' | 'notificaciones'): void {
    this.abierto.update((actual) => (actual === popover ? null : popover));
  }

  cerrarSesion(): void {
    this.abierto.set(null);
    this.auth.cerrarSesion();
    this.router.navigateByUrl('/iniciar-sesion');
  }

  @HostListener('document:click', ['$event'])
  protected alHacerClic(evento: MouseEvent): void {
    if (this.abierto() && !this.pie().nativeElement.contains(evento.target as Node)) this.abierto.set(null);
  }

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    this.abierto.set(null);
    this.cerrar.emit();
  }
}

function leerPreferencia(): boolean | null {
  try {
    const valor = localStorage.getItem(CLAVE_CONTRAIDO);
    return valor === null ? null : valor === 'true';
  } catch {
    return null;
  }
}
