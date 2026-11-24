import { Component, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService, ClavePregunta, PREGUNTAS_SEGURIDAD } from '../auth.service';

export type GuardarPregunta = (clave: ClavePregunta, respuesta: string, actual?: string) => Observable<{ ok: boolean; mensaje?: string }>;

/**
 * Elegir la pregunta de seguridad (una, como el backend: `security_question`). Como pantalla (primer acceso o
 * cuenta sin pregunta) entra al terminar; dentro de Mi perfil o del portal (`enPerfil`) pide la contraseña actual
 * y avisa al guardar. El portal pasa su propio `guardarCon`; si no, guarda en la cuenta del personal.
 */
@Component({
  selector: 'app-elegir-pregunta',
  standalone: true,
  template: `
    <form [class.tarjeta]="!enPerfil()" class="pregunta" (submit)="$event.preventDefault(); guardar()" novalidate>
      @if (!enPerfil()) {
        <span class="tarjeta__icono"><img src="assets/iconos/key-lg.svg" width="26" height="26" alt="" /></span>
        <div class="tarjeta__encabezado">
          <h1 class="tarjeta__titulo">Elige tu pregunta de seguridad</h1>
          <p class="tarjeta__descripcion">Cada vez que inicies sesión te pediremos contestarla, después de tu contraseña. También te la haremos si olvidas tu contraseña. Elige una cuya respuesta solo tú sepas.</p>
        </div>
      }

      @if (error(); as mensaje) {
        <div class="aviso aviso--error" role="alert"><img src="assets/iconos/alert.svg" width="16" height="16" alt="" /><span>{{ mensaje }}</span></div>
      }

      <div class="campo">
        <label class="campo__etiqueta" for="pregunta-elegida">Pregunta *</label>
        <div class="campo__control campo__control--40">
          <select class="campo__input campo__select" id="pregunta-elegida" (change)="elegida.set($any($event.target).value)">
            @for (p of opciones; track p.clave) {
              <option [value]="p.clave" [selected]="p.clave === elegida()">{{ p.texto }}</option>
            }
          </select>
          <img src="assets/cajera/chev-d.svg" width="16" height="16" alt="" />
        </div>
      </div>
      <div class="campo">
        <label class="campo__etiqueta" for="respuesta-nueva">Respuesta *</label>
        <div class="campo__control campo__control--40" [class.campo__control--error]="intentado() && corta()">
          <input class="campo__input" id="respuesta-nueva" autocomplete="off" maxlength="60" [value]="respuesta()" (input)="respuesta.set($any($event.target).value); error.set(null)" />
        </div>
        @if (intentado() && corta()) { <span class="campo__error">Escribe al menos 2 letras.</span> }
      </div>

      @if (enPerfil()) {
        <div class="campo">
          <label class="campo__etiqueta" for="pregunta-actual">Tu contraseña actual *</label>
          <div class="campo__control campo__control--40" [class.campo__control--error]="intentado() && !actual()">
            <input id="pregunta-actual" class="campo__input" type="password" autocomplete="current-password" [value]="actual()" (input)="actual.set($any($event.target).value); error.set(null)" />
          </div>
        </div>
      }

      <p class="nota">La respuesta no distingue mayúsculas ni acentos. Nadie del taller puede verla.</p>
      <div class="acciones">
        @if (enPerfil()) {
          <button type="button" class="boton boton--contorno boton--40" (click)="cancelado.emit()">Cancelar</button>
        }
        <button type="submit" class="boton boton--primario" [class.boton--bloque]="!enPerfil()" [class.boton--40]="enPerfil()" [disabled]="enviando()">
          {{ enviando() ? 'Guardando…' : enPerfil() ? 'Guardar pregunta' : 'Guardar y entrar' }}
        </button>
      </div>
      @if (!enPerfil()) {
        <button type="button" class="enlace salir" (click)="salir()">Salir</button>
      }
    </form>
  `,
  styles: `
    .pregunta { display: flex; flex-direction: column; gap: 14px; }
    .nota { font-size: 12px; color: var(--color-texto-secundario); }
    .acciones { display: flex; justify-content: flex-end; gap: 8px; }
    .salir { align-self: center; }
  `,
})
export class ElegirPreguntaComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  /** Dentro de Mi perfil o del portal: pide la contraseña actual y no navega. */
  readonly enPerfil = input(false);
  /** Cómo guardar (el portal guarda en la cuenta del cliente); por omisión, la del personal. */
  readonly guardarCon = input<GuardarPregunta | null>(null);
  readonly guardada = output<void>();
  readonly cancelado = output<void>();

  protected readonly opciones = PREGUNTAS_SEGURIDAD;
  protected readonly elegida = signal<ClavePregunta>(PREGUNTAS_SEGURIDAD[0].clave);
  protected readonly respuesta = signal('');
  protected readonly actual = signal('');
  protected readonly intentado = signal(false);
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected corta(): boolean {
    return this.respuesta().trim().length < 2;
  }

  protected guardar(): void {
    this.intentado.set(true);
    if (this.corta() || (this.enPerfil() && !this.actual()) || this.enviando()) return;
    this.enviando.set(true);
    // Personal: PUT /auth/security-question (la API pide la contraseña actual)
    const guardar = this.guardarCon() ?? ((c, r, a) => this.auth.guardarPregunta(a ?? '', { pregunta: c, respuesta: r }));
    guardar(this.elegida(), this.respuesta(), this.enPerfil() ? this.actual() : undefined).subscribe((r) => {
      this.enviando.set(false);
      if (!r.ok) {
        this.error.set(r.mensaje ?? 'No se pudo guardar.');
        return;
      }
      this.guardada.emit();
      if (!this.enPerfil()) this.router.navigateByUrl('/inicio');
    });
  }

  protected salir(): void {
    this.auth.cerrarSesion();
    this.router.navigateByUrl('/iniciar-sesion');
  }
}
