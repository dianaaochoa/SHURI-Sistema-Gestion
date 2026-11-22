import { Component, computed, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, PREGUNTAS_SEGURIDAD } from '../auth.service';

/**
 * Elegir las 2 preguntas de seguridad. Como pantalla (primer acceso o cuenta sin preguntas) entra al terminar;
 * dentro de Mi perfil (`enPerfil`) pide la contraseña actual y avisa al guardar.
 */
@Component({
  selector: 'app-elegir-preguntas',
  standalone: true,
  template: `
    <form [class.tarjeta]="!enPerfil()" class="preguntas" (submit)="$event.preventDefault(); guardar()" novalidate>
      @if (!enPerfil()) {
        <span class="tarjeta__icono"><img src="assets/iconos/key-lg.svg" width="26" height="26" alt="" /></span>
        <div class="tarjeta__encabezado">
          <h1 class="tarjeta__titulo">Elige tus preguntas de seguridad</h1>
          <p class="tarjeta__descripcion">Cada vez que inicies sesión te pediremos contestarlas, después de tu contraseña. Elige 2 preguntas distintas cuyas respuestas solo tú sepas.</p>
        </div>
      }

      @if (error(); as mensaje) {
        <div class="aviso aviso--error" role="alert"><img src="assets/iconos/alert.svg" width="16" height="16" alt="" /><span>{{ mensaje }}</span></div>
      }

      @for (n of [0, 1]; track n) {
        <div class="par">
          <div class="campo">
            <label class="campo__etiqueta" [attr.for]="'pregunta-' + n">Pregunta {{ n + 1 }} *</label>
            <div class="campo__control campo__control--40">
              <select class="campo__input campo__select" [id]="'pregunta-' + n" (change)="elegir(n, $any($event.target).value)">
                @for (p of opciones; track p) {
                  <option [value]="p" [selected]="p === elegidas()[n]" [disabled]="p === elegidas()[n === 0 ? 1 : 0]">{{ p }}</option>
                }
              </select>
              <img src="assets/cajera/chev-d.svg" width="16" height="16" alt="" />
            </div>
          </div>
          <div class="campo">
            <label class="campo__etiqueta" [attr.for]="'respuesta-nueva-' + n">Respuesta *</label>
            <div class="campo__control campo__control--40" [class.campo__control--error]="intentado() && corta(n)">
              <input class="campo__input" [id]="'respuesta-nueva-' + n" autocomplete="off" maxlength="60" [value]="respuestas()[n]" (input)="escribir(n, $any($event.target).value)" />
            </div>
            @if (intentado() && corta(n)) { <span class="campo__error">Escribe al menos 2 letras.</span> }
          </div>
        </div>
      }

      @if (enPerfil()) {
        <div class="campo">
          <label class="campo__etiqueta" for="preguntas-actual">Tu contraseña actual *</label>
          <div class="campo__control campo__control--40" [class.campo__control--error]="intentado() && !actual()">
            <input id="preguntas-actual" class="campo__input" type="password" autocomplete="current-password" [value]="actual()" (input)="actual.set($any($event.target).value); error.set(null)" />
          </div>
        </div>
      }

      <p class="nota">Las respuestas no distinguen mayúsculas ni acentos. Nadie del taller puede verlas.</p>
      <div class="acciones">
        @if (enPerfil()) {
          <button type="button" class="boton boton--contorno boton--40" (click)="cancelado.emit()">Cancelar</button>
        }
        <button type="submit" class="boton boton--primario" [class.boton--bloque]="!enPerfil()" [class.boton--40]="enPerfil()" [disabled]="enviando()">
          {{ enviando() ? 'Guardando…' : enPerfil() ? 'Guardar preguntas' : 'Guardar y entrar' }}
        </button>
      </div>
      @if (!enPerfil()) {
        <button type="button" class="enlace salir" (click)="salir()">Salir</button>
      }
    </form>
  `,
  styles: `
    .preguntas { display: flex; flex-direction: column; gap: 14px; }
    .par { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--color-borde); border-radius: 8px; }
    .nota { font-size: 12px; color: var(--color-texto-secundario); }
    .acciones { display: flex; justify-content: flex-end; gap: 8px; }
    .salir { align-self: center; }
  `,
})
export class ElegirPreguntasComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  /** Dentro de Mi perfil: pide la contraseña actual y no navega. */
  readonly enPerfil = input(false);
  readonly guardadas = output<void>();
  readonly cancelado = output<void>();

  protected readonly opciones = PREGUNTAS_SEGURIDAD;
  protected readonly elegidas = signal([PREGUNTAS_SEGURIDAD[0], PREGUNTAS_SEGURIDAD[1]]);
  protected readonly respuestas = signal(['', '']);
  protected readonly actual = signal('');
  protected readonly intentado = signal(false);
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly listas = computed(() => this.respuestas().every((r) => r.trim().length >= 2));

  protected corta(n: number): boolean {
    return this.respuestas()[n].trim().length < 2;
  }

  protected elegir(n: number, pregunta: string): void {
    this.elegidas.update((l) => l.map((p, k) => (k === n ? pregunta : p)));
  }

  protected escribir(n: number, valor: string): void {
    this.respuestas.update((l) => l.map((r, k) => (k === n ? valor : r)));
    this.error.set(null);
  }

  protected guardar(): void {
    this.intentado.set(true);
    if (!this.listas() || (this.enPerfil() && !this.actual()) || this.enviando()) return;
    this.enviando.set(true);
    const lista = this.elegidas().map((pregunta, i) => ({ pregunta, respuesta: this.respuestas()[i] }));
    this.auth.guardarPreguntas(lista, this.enPerfil() ? this.actual() : undefined).subscribe((r) => {
      this.enviando.set(false);
      if (!r.ok) {
        this.error.set(r.mensaje ?? 'No se pudieron guardar.');
        return;
      }
      this.guardadas.emit();
      if (!this.enPerfil()) this.router.navigateByUrl('/inicio');
    });
  }

  protected salir(): void {
    this.auth.cerrarSesion();
    this.router.navigateByUrl('/iniciar-sesion');
  }
}
