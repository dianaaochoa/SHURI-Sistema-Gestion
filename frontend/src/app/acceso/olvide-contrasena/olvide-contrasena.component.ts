import { Component, ElementRef, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

/**
 * A.3 ¿Olvidaste tu contraseña? · A.4 correo enviado. Igual que el backend (`/auth/password/forgot` y
 * `/auth/password/answer`): usuario o correo → su pregunta de seguridad → contraseña temporal al correo.
 */
@Component({
  selector: 'app-olvide-contrasena',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './olvide-contrasena.component.html',
})
export class OlvideContrasenaComponent {
  private readonly auth = inject(AuthService);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly formulario = inject(NonNullableFormBuilder).group({
    usuario: ['', Validators.required],
  });

  readonly enviando = signal(false);
  /** Paso 2: la pregunta que debe contestar. */
  readonly pregunta = signal<string | null>(null);
  readonly respuesta = signal('');
  readonly respuestaIntentada = signal(false);
  readonly error = signal<string | null>(null);
  /** La cuenta no se puede recuperar en línea (o se anuló por respuestas mal): aviso para ir con el administrador. */
  readonly sinRecuperacion = signal<string | null>(null);
  /** Correo enmascarado al que se envió la contraseña temporal; si existe se muestra A.4. */
  readonly correoEnviado = signal<string | null>(null);
  /** Usuario de la cuenta recuperada (aunque haya escrito su correo), para llenar el inicio de sesión. */
  readonly usuarioRecuperado = signal('');

  get usuarioInvalido(): boolean {
    const control = this.formulario.controls.usuario;
    return control.invalid && control.touched;
  }

  enviar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    this.enviando.set(true);
    this.sinRecuperacion.set(null);
    this.auth.iniciarRecuperacion(this.formulario.getRawValue().usuario).subscribe((r) => {
      this.enviando.set(false);
      if ('mensaje' in r) {
        this.sinRecuperacion.set(r.mensaje);
        return;
      }
      this.pregunta.set(r.pregunta);
      setTimeout(() => this.elemento.nativeElement.querySelector<HTMLInputElement>('#respuesta')?.focus());
    });
  }

  escribir(valor: string): void {
    this.respuesta.set(valor);
    this.error.set(null);
  }

  responder(): void {
    this.respuestaIntentada.set(true);
    if (!this.respuesta().trim() || this.enviando()) return;
    this.enviando.set(true);
    this.auth.responderRecuperacion(this.respuesta()).subscribe((r) => {
      this.enviando.set(false);
      if (r.ok) {
        this.usuarioRecuperado.set(r.usuario);
        this.correoEnviado.set(r.correo);
        return;
      }
      this.respuesta.set('');
      this.respuestaIntentada.set(false);
      if (r.anulada) {
        this.pregunta.set(null);
        this.sinRecuperacion.set(r.mensaje);
      } else this.error.set(r.mensaje);
    });
  }

  /** Otro usuario: de vuelta al paso 1. */
  cambiarUsuario(): void {
    this.pregunta.set(null);
    this.respuesta.set('');
    this.respuestaIntentada.set(false);
    this.error.set(null);
  }
}
