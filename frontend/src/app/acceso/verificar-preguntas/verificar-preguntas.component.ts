import { Component, ElementRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';

/** Segundo paso del inicio de sesión: contestar las 2 preguntas de seguridad (A.1 → “Confirma que eres tú”). */
@Component({
  selector: 'app-verificar-preguntas',
  standalone: true,
  template: `
    @if (auth.verificacion(); as v) {
      <form class="tarjeta" (submit)="$event.preventDefault(); entrar()" novalidate>
        <span class="tarjeta__icono"><img src="assets/iconos/key-lg.svg" width="26" height="26" alt="" /></span>
        <div class="tarjeta__encabezado">
          <h1 class="tarjeta__titulo">Confirma que eres tú</h1>
          <p class="tarjeta__descripcion">Hola, {{ v.nombre.split(' ')[0] }}. Contesta tus preguntas de seguridad para entrar.</p>
        </div>

        @if (error(); as mensaje) {
          <div class="aviso aviso--error" role="alert"><img src="assets/iconos/alert.svg" width="16" height="16" alt="" /><span>{{ mensaje }}</span></div>
        }

        @for (pregunta of v.preguntas; track i; let i = $index) {
          <div class="campo">
            <label class="campo__etiqueta" [attr.for]="'respuesta-' + i">{{ pregunta }}</label>
            <div class="campo__control" [class.campo__control--error]="intentado() && !respuestas()[i].trim()">
              <img src="assets/iconos/lock-a5.svg" width="16" height="16" alt="" />
              <input
                class="campo__input"
                [id]="'respuesta-' + i"
                [type]="ver() ? 'text' : 'password'"
                autocomplete="off"
                [value]="respuestas()[i]"
                (input)="escribir(i, $any($event.target).value)"
              />
              @if (i === 0) {
                <button type="button" class="campo__boton-icono" [class.campo__boton-icono--activo]="ver()" [attr.aria-label]="ver() ? 'Ocultar respuestas' : 'Mostrar respuestas'" [attr.aria-pressed]="ver()" (click)="ver.set(!ver())">
                  <img src="assets/iconos/eye.svg" width="16" height="16" alt="" />
                </button>
              }
            </div>
            @if (intentado() && !respuestas()[i].trim()) { <span class="campo__error">Escribe tu respuesta.</span> }
          </div>
        }

        <p class="nota">No importan mayúsculas ni acentos. ¿No las recuerdas? Pide al administrador una contraseña temporal: al entrar elegirás preguntas nuevas.</p>

        <button type="submit" class="boton boton--primario boton--bloque" [disabled]="enviando()">{{ enviando() ? 'Revisando…' : 'Entrar' }}</button>
        <button type="button" class="enlace volver" (click)="volver()">No soy yo · volver a iniciar sesión</button>
      </form>
    }
  `,
  styles: `
    .nota { font-size: 12px; color: var(--color-texto-secundario); }
    .volver { align-self: center; }
  `,
})
export class VerificarPreguntasComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly respuestas = signal(['', '']);
  protected readonly ver = signal(false);
  protected readonly intentado = signal(false);
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    setTimeout(() => this.elemento.nativeElement.querySelector<HTMLInputElement>('#respuesta-0')?.focus());
  }

  protected escribir(i: number, valor: string): void {
    this.respuestas.update((r) => r.map((x, k) => (k === i ? valor : x)));
    this.error.set(null);
  }

  protected entrar(): void {
    this.intentado.set(true);
    if (this.respuestas().some((r) => !r.trim()) || this.enviando()) return;
    this.enviando.set(true);
    this.auth.responderPreguntas(this.respuestas()).subscribe((r) => {
      this.enviando.set(false);
      if (r.ok) {
        this.router.navigateByUrl('/inicio');
        return;
      }
      this.error.set(r.mensaje);
      this.respuestas.set(['', '']);
      this.intentado.set(false);
      // Si se bloqueó la cuenta ya no hay preguntas que contestar: de vuelta al inicio de sesión con el aviso.
      if (!this.auth.verificacion()) this.router.navigate(['/iniciar-sesion'], { state: { aviso: r.mensaje } });
    });
  }

  protected volver(): void {
    this.auth.cancelarVerificacion();
    this.router.navigateByUrl('/iniciar-sesion');
  }
}
