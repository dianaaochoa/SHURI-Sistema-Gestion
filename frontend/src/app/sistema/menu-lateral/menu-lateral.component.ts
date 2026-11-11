import { Component, ElementRef, HostListener, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { CajaService } from '../../cajera/caja.service';
import { SalirConTurnoComponent } from '../../cajera/salir-con-turno/salir-con-turno.component';
import { MenuUsuarioComponent } from '../menu-usuario/menu-usuario.component';
import { DestinoMenu, NAVEGACION, iniciales } from '../navegacion';
import { OrdenesService } from '../../cajera/ordenes/ordenes.service';
import { MensajesService } from '../../jefe/mensajes/mensajes.service';
import { EN_TALLER } from '../../jefe/tecnicos/carga';
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
  imports: [RouterLink, RouterLinkActive, MenuUsuarioComponent, PanelNotificacionesComponent, SalirConTurnoComponent],
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

  private readonly caja = inject(CajaService);
  private readonly mensajes = inject(MensajesService);
  private readonly ordenes = inject(OrdenesService);

  /** Mensajes del jefe: conversaciones sin responder (J11); los demás destinos, su número fijo. */
  protected insignia(d: DestinoMenu): number {
    return d.ruta === 'mensajes' && this.sesion()?.rol === 'jefe-tecnicos' ? this.mensajes.sinResponder().length : (d.insignia ?? 0);
  }

  protected readonly sesion = this.auth.sesion;
  protected readonly navegacion = computed(() => NAVEGACION[this.sesion()?.rol ?? 'cajera']);
  protected readonly esCajera = computed(() => this.sesion()?.rol === 'cajera');
  /** La cajera ve el estado real de su caja (C1.1 / C1.2); los demás roles, el de navegacion.ts. */
  /** La cajera ve su caja; el jefe, las órdenes abiertas (el mismo conteo de su Inicio, J1); los demás, el texto fijo. */
  protected readonly resumen = computed(() => {
    if (this.esCajera()) return this.caja.resumen();
    if (this.sesion()?.rol === 'jefe-tecnicos') {
      const abiertas = this.ordenes.ordenes().filter((o) => EN_TALLER.includes(o.estado)).length;
      return `${abiertas} ${abiertas === 1 ? 'orden abierta' : 'órdenes abiertas'}`;
    }
    return this.navegacion().resumen;
  });
  protected readonly cajaCerrada = computed(() => this.esCajera() && !this.caja.abierta());
  /** C1.7: confirmar la salida cuando la cajera deja su turno abierto. */
  protected readonly confirmarSalida = signal(false);
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
    if (this.esCajera() && this.caja.abierta()) {
      this.confirmarSalida.set(true);
      return;
    }
    this.salir();
  }

  irACorte(): void {
    this.confirmarSalida.set(false);
    this.cerrar.emit();
    this.router.navigateByUrl('/cajera/corte-de-caja');
  }

  salir(): void {
    this.confirmarSalida.set(false);
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
