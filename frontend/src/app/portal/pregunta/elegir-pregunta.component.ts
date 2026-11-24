import { Component, input, output, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { ClavePregunta, PREGUNTAS_SEGURIDAD } from '../../compartido/preguntas-seguridad';

export type GuardarPregunta = (clave: ClavePregunta, respuesta: string, actual: string) => Observable<{ ok: boolean; mensaje?: string }>;

/**
 * Elegir la pregunta de seguridad del cliente en el portal (una, como `customers.security_question`). Pide la
 * contraseña actual, como `PUT /portal/security-question`. El personal la elige contra la API en A.5 y Mi perfil.
 */
@Component({
  selector: 'app-elegir-pregunta',
  standalone: true,
  template: `
    <form class="pregunta" (submit)="$event.preventDefault(); guardar()" novalidate>

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

      <div class="campo">
          <label class="campo__etiqueta" for="pregunta-actual">Tu contraseña actual *</label>
          <div class="campo__control campo__control--40" [class.campo__control--error]="intentado() && !actual()">
            <input id="pregunta-actual" class="campo__input" type="password" autocomplete="current-password" [value]="actual()" (input)="actual.set($any($event.target).value); error.set(null)" />
          </div>
        </div>

      <p class="nota">La respuesta no distingue mayúsculas ni acentos. Nadie del taller puede verla.</p>
      <div class="acciones">
        <button type="button" class="boton boton--contorno boton--40" (click)="cancelado.emit()">Cancelar</button>
        <button type="submit" class="boton boton--primario boton--40" [disabled]="enviando()">{{ enviando() ? 'Guardando…' : 'Guardar pregunta' }}</button>
      </div>
    </form>
  `,
  styles: `
    .pregunta { display: flex; flex-direction: column; gap: 14px; }
    .nota { font-size: 12px; color: var(--color-texto-secundario); }
    .acciones { display: flex; justify-content: flex-end; gap: 8px; }
  `,
})
export class ElegirPreguntaComponent {
  /** Cómo se guarda (en la cuenta del cliente). */
  readonly guardarCon = input.required<GuardarPregunta>();
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
    if (this.corta() || !this.actual() || this.enviando()) return;
    this.enviando.set(true);
    this.guardarCon()(this.elegida(), this.respuesta(), this.actual()).subscribe((r) => {
      this.enviando.set(false);
      if (!r.ok) {
        this.error.set(r.mensaje ?? 'No se pudo guardar.');
        return;
      }
      this.guardada.emit();
    });
  }
}
