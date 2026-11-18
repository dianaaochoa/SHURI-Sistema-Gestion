import { Component, DestroyRef, ElementRef, NgZone, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, CLAVE_ACTIVIDAD, CLAVE_BLOQUEO } from '../../acceso/auth.service';
import { iniciales } from '../navegacion';

/** Regla general de Figma: la pantalla se bloquea tras 30 minutos sin uso. */
export const MINUTOS_SIN_USO = 30;
const LIMITE_MS = MINUTOS_SIN_USO * 60_000;
/** El último uso se guarda cada tanto (no en cada tecla) y se revisa cada 15 s. */
const GUARDAR_CADA_MS = 5_000;
const REVISAR_CADA_MS = 15_000;
const EVENTOS_DE_USO = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

const leer = (clave: string): string | null => {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
};
const escribir = (clave: string, valor: string | null): void => {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch {
    /* sin almacenamiento: el bloqueo solo vive en esta pestaña */
  }
};

/**
 * Bloqueo por inactividad del personal: tras 30 min sin uso cubre la pantalla y pide la contraseña.
 * Lo que había en pantalla (una venta a medias, un diagnóstico) se conserva al desbloquear.
 * El último uso y el bloqueo se comparten entre pestañas del mismo equipo.
 */
@Component({
  selector: 'app-bloqueo-sesion',
  standalone: true,
  template: `
    @if (bloqueada()) {
      <div class="modal-fondo bloqueo" role="dialog" aria-modal="true" aria-labelledby="bloqueo-titulo" (keydown)="$event.stopPropagation()">
        <form class="modal bloqueo__tarjeta" (submit)="$event.preventDefault(); desbloquear()">
          <span class="avatar bloqueo__avatar">{{ iniciales() }}</span>
          <div class="bloqueo__texto">
            <h2 id="bloqueo-titulo">Pantalla bloqueada</h2>
            <p>Pasaron {{ minutos }} minutos sin uso. {{ nombre() }}, escribe tu contraseña para seguir donde te quedaste.</p>
          </div>
          @if (error(); as mensaje) {
            <div class="aviso aviso--error" role="alert">
              <img src="assets/iconos/alert.svg" width="16" height="16" alt="" />
              <span>{{ mensaje }}</span>
            </div>
          }
          <div class="campo">
            <label class="campo__etiqueta" for="bloqueo-contrasena">Contraseña</label>
            <div class="campo__control" [class.campo__control--error]="error()">
              <img src="assets/iconos/lock.svg" width="16" height="16" alt="" />
              <input
                #campo
                id="bloqueo-contrasena"
                class="campo__input"
                [type]="ver() ? 'text' : 'password'"
                autocomplete="current-password"
                [value]="contrasena()"
                (input)="contrasena.set($any($event.target).value); error.set(null)"
              />
              <button
                type="button"
                class="campo__boton-icono"
                [class.campo__boton-icono--activo]="ver()"
                [attr.aria-label]="ver() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                [attr.aria-pressed]="ver()"
                (click)="ver.set(!ver())"
              >
                <img src="assets/iconos/eye.svg" width="16" height="16" alt="" />
              </button>
            </div>
          </div>
          <button type="submit" class="boton boton--primario boton--bloque" [disabled]="enviando() || !contrasena()">
            {{ enviando() ? 'Revisando…' : 'Desbloquear' }}
          </button>
          <button type="button" class="enlace bloqueo__otro" (click)="otroUsuario()">Entrar con otro usuario</button>
        </form>
      </div>
    }
  `,
  styles: `
    .bloqueo { z-index: 100; backdrop-filter: blur(6px); }
    .bloqueo__tarjeta { max-width: 400px; align-items: stretch; text-align: center; }
    .bloqueo__avatar { align-self: center; width: 56px; height: 56px; font-size: 18px; }
    .bloqueo__texto h2 { margin: 0 0 4px; font-size: 20px; color: var(--color-marino); }
    .bloqueo__texto p { margin: 0; font-size: 14px; color: var(--color-texto-secundario); }
    .bloqueo .campo { text-align: left; }
    .bloqueo__otro { align-self: center; }
  `,
})
export class BloqueoSesionComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly zona = inject(NgZone);
  private readonly campo = viewChild<ElementRef<HTMLInputElement>>('campo');

  readonly bloqueada = signal(false);
  protected readonly minutos = MINUTOS_SIN_USO;
  protected readonly contrasena = signal('');
  protected readonly ver = signal(false);
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly nombre = computed(() => (this.auth.sesion()?.nombre ?? '').split(' ')[0]);
  protected readonly iniciales = computed(() => iniciales(this.auth.sesion()?.nombre ?? ''));
  private guardado = 0;

  constructor() {
    // Un registro viejo (de otra sesión) no cuenta: se empieza a medir desde ahora.
    const desde = Date.parse(this.auth.sesion()?.desde ?? '') || 0;
    const ultimo = Number(leer(CLAVE_ACTIVIDAD)) || 0;
    if (ultimo < desde || !ultimo) escribir(CLAVE_ACTIVIDAD, String(Date.now()));
    this.revisar();

    // Fuera de la zona de Angular: mover el mouse o teclear no redibuja la pantalla.
    const alUsar = () => this.alUsar();
    const alVolver = () => this.revisar();
    this.zona.runOutsideAngular(() => {
      for (const evento of EVENTOS_DE_USO) window.addEventListener(evento, alUsar, { capture: true, passive: true });
      window.addEventListener('focus', alVolver);
      window.addEventListener('storage', alVolver);
      document.addEventListener('visibilitychange', alVolver);
    });
    // Con la pantalla bloqueada, ninguna tecla llega a la página de atrás (atajos del punto de venta, Esc…).
    const atajar = (evento: KeyboardEvent) => {
      if (this.bloqueada() && !(evento.target as Element | null)?.closest?.('.bloqueo')) {
        evento.preventDefault();
        evento.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', atajar, true);
    const reloj = setInterval(() => this.revisar(), REVISAR_CADA_MS);

    inject(DestroyRef).onDestroy(() => {
      clearInterval(reloj);
      for (const evento of EVENTOS_DE_USO) window.removeEventListener(evento, alUsar, { capture: true });
      window.removeEventListener('focus', alVolver);
      window.removeEventListener('storage', alVolver);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('keydown', atajar, true);
    });
  }

  /** Bloquea si pasaron 30 min desde el último uso (en cualquier pestaña); desbloquea si otra pestaña ya lo hizo. */
  private revisar(): void {
    if (!this.auth.sesion()) return;
    const ultimo = Number(leer(CLAVE_ACTIVIDAD)) || Date.now();
    const debe = leer(CLAVE_BLOQUEO) === '1' || Date.now() - ultimo > LIMITE_MS;
    if (debe === this.bloqueada()) return;
    if (debe) escribir(CLAVE_BLOQUEO, '1');
    this.zona.run(() => {
      this.bloqueada.set(debe);
      this.contrasena.set('');
      this.error.set(null);
      if (debe) setTimeout(() => this.campo()?.nativeElement.focus());
    });
  }

  private alUsar(): void {
    // Primero se revisa: volver después de 30 min y mover el mouse no debe saltarse el bloqueo.
    this.revisar();
    if (this.bloqueada() || Date.now() - this.guardado < GUARDAR_CADA_MS) return;
    this.guardado = Date.now();
    escribir(CLAVE_ACTIVIDAD, String(this.guardado));
  }

  protected desbloquear(): void {
    if (!this.contrasena() || this.enviando()) return;
    this.enviando.set(true);
    this.auth.desbloquear(this.contrasena()).subscribe((resultado) => {
      this.enviando.set(false);
      if (!resultado.ok) {
        // Aquí no se escribe el usuario: el aviso solo habla de la contraseña.
        this.error.set(resultado.mensaje.replace('Usuario o contraseña incorrectos.', 'Contraseña incorrecta.'));
        this.contrasena.set('');
        this.campo()?.nativeElement.focus();
        return;
      }
      // AuthService ya guardó el uso y quitó el bloqueo para todas las pestañas.
      this.guardado = Date.now();
      this.bloqueada.set(false);
      this.contrasena.set('');
      this.ver.set(false);
    });
  }

  protected otroUsuario(): void {
    this.bloqueada.set(false);
    this.auth.cerrarSesion();
    this.router.navigateByUrl('/iniciar-sesion');
  }
}
