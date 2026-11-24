import { Component, ElementRef, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortalMarcaComponent } from '../compartido/portal-marca.component';
import { PortalPieComponent } from '../compartido/portal-pie.component';
import { PortalService } from '../portal.service';

/**
 * P1.3 · ¿Olvidaste tu contraseña? Igual que el personal (A.3), con dos factores:
 *  1. Su correo → la API devuelve su pregunta secreta.
 *  2. Su respuesta → le llega una contraseña temporal al correo.
 */
@Component({
  selector: 'app-olvide-portal',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PortalMarcaComponent, PortalPieComponent],
  templateUrl: './olvide-portal.component.html',
  styleUrls: ['../portal.css', '../../acceso/crear-contrasena/crear-contrasena.component.css'],
})
export class OlvidePortalComponent {
  private readonly portal = inject(PortalService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly formulario = this.fb.group({ correo: ['', [Validators.required, Validators.email]] });
  protected readonly formularioRespuesta = this.fb.group({ respuesta: ['', Validators.required] });
  protected readonly enviando = signal(false);
  protected readonly error = signal('');
  /** Paso 2: la pregunta secreta del cliente. */
  protected readonly pregunta = signal<{ id: string; texto: string } | null>(null);
  /** Paso 3: correo (enmascarado) al que llegó la temporal. */
  protected readonly enviado = signal('');

  protected get invalido(): boolean {
    const c = this.formulario.controls.correo;
    return c.invalid && c.touched;
  }

  protected enviar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    this.enviando.set(true);
    this.error.set('');
    this.portal.iniciarRecuperacion(this.formulario.getRawValue().correo).subscribe((r) => {
      this.enviando.set(false);
      if (r.ok) this.pregunta.set({ id: r.recuperacionId, texto: r.pregunta });
      else this.error.set(r.mensaje);
    });
  }

  protected responder(): void {
    const p = this.pregunta();
    if (!p || this.formularioRespuesta.invalid) {
      this.formularioRespuesta.markAllAsTouched();
      return;
    }
    this.enviando.set(true);
    this.error.set('');
    this.portal.responderPregunta(p.id, this.formularioRespuesta.getRawValue().respuesta).subscribe((r) => {
      this.enviando.set(false);
      if (r.ok) this.enviado.set(r.correo);
      else {
        this.error.set(r.mensaje);
        this.formularioRespuesta.reset();
      }
    });
  }

  protected volver(): void {
    this.pregunta.set(null);
    this.error.set('');
    this.formularioRespuesta.reset();
  }
}
