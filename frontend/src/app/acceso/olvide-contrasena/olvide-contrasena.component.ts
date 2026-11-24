import { Component, ElementRef, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

/**
 * A.3 ¿Olvidaste tu contraseña? · A.4 correo enviado.
 * Flujo: usuario → pregunta secreta → contraseña temporal por correo → al entrar, crea la suya (A.5).
 */
@Component({
  selector: 'app-olvide-contrasena',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './olvide-contrasena.component.html',
})
export class OlvideContrasenaComponent {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly formulario = this.fb.group({
    usuario: ['', Validators.required],
  });
  /** Paso 2: en su propio formGroup para que Angular atrape el envío (sin él, el navegador recarga la página). */
  readonly formularioRespuesta = this.fb.group({ respuesta: ['', Validators.required] });
  readonly respuesta = this.formularioRespuesta.controls.respuesta;

  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);
  /** Paso 2: la pregunta secreta de la cuenta. */
  readonly pregunta = signal<string | null>(null);
  private recuperacionId: string | null = null;
  /** La cuenta no se puede recuperar en línea (no existe o no tiene pregunta): se pide al administrador. */
  readonly sinRecuperacion = signal<string | null>(null);
  /** Correo enmascarado al que se envió la contraseña temporal; si existe se muestra A.4. */
  readonly correoEnviado = signal<string | null>(null);
  /** Usuario de la cuenta recuperada (aunque haya escrito su correo), para llenar el inicio de sesión. */
  readonly usuarioRecuperado = signal('');

  get usuarioInvalido(): boolean {
    const control = this.formulario.controls.usuario;
    return control.invalid && control.touched;
  }

  get respuestaInvalida(): boolean {
    return this.respuesta.invalid && this.respuesta.touched;
  }

  /** Paso 1: buscar la pregunta secreta del usuario. */
  enviar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    this.enviando.set(true);
    this.error.set(null);
    this.auth.iniciarRecuperacion(this.formulario.getRawValue().usuario).subscribe((r) => {
      this.enviando.set(false);
      if (r.ok) {
        this.recuperacionId = r.recuperacionId;
        this.pregunta.set(r.pregunta);
      } else {
        this.sinRecuperacion.set(r.mensaje);
      }
    });
  }

  /** Paso 2: responder la pregunta; si es correcta, llega la contraseña temporal. */
  responder(): void {
    if (!this.recuperacionId) return;
    if (this.respuesta.invalid) {
      this.respuesta.markAsTouched();
      return;
    }

    this.enviando.set(true);
    this.error.set(null);
    this.auth.responderPregunta(this.recuperacionId, this.respuesta.value).subscribe((r) => {
      this.enviando.set(false);
      if (r.ok) {
        this.correoEnviado.set(r.correo);
      } else {
        // Respuesta incorrecta (a la 3.ª se anula la recuperación) o recuperación vencida
        this.error.set(r.mensaje);
        this.respuesta.reset('');
      }
    });
  }

  /** Volver a escribir el usuario. */
  reiniciar(): void {
    this.pregunta.set(null);
    this.sinRecuperacion.set(null);
    this.error.set(null);
    this.recuperacionId = null;
    this.respuesta.reset('');
  }
}
