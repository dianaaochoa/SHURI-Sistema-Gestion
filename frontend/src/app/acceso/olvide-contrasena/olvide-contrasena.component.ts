import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

/** A.3 ¿Olvidaste tu contraseña? · A.4 correo enviado */
@Component({
  selector: 'app-olvide-contrasena',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './olvide-contrasena.component.html',
})
export class OlvideContrasenaComponent {
  private readonly auth = inject(AuthService);

  readonly formulario = inject(NonNullableFormBuilder).group({
    usuario: ['', Validators.required],
  });

  readonly enviando = signal(false);
  /** Correo enmascarado al que se envió la contraseña temporal; si existe se muestra A.4. */
  readonly correoEnviado = signal<string | null>(null);

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
    this.auth.solicitarContrasenaTemporal(this.formulario.getRawValue().usuario).subscribe((correo) => {
      this.enviando.set(false);
      this.correoEnviado.set(correo);
    });
  }
}
