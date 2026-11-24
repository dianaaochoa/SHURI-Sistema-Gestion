import { Component, ElementRef, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortalMarcaComponent } from '../compartido/portal-marca.component';
import { PortalPieComponent } from '../compartido/portal-pie.component';
import { PortalService } from '../portal.service';

/**
 * P1.3 · ¿Olvidaste tu contraseña? Como la API (`/portal/password/forgot` y `/answer`): correo → su pregunta de
 * seguridad → contraseña temporal al correo.
 */
@Component({
  selector: 'app-olvide-portal',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PortalMarcaComponent, PortalPieComponent],
  templateUrl: './olvide-portal.component.html',
  styleUrls: ['../portal.css'],
})
export class OlvidePortalComponent {
  private readonly portal = inject(PortalService);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly formulario = inject(NonNullableFormBuilder).group({ correo: ['', [Validators.required, Validators.email]] });
  protected readonly enviando = signal(false);
  /** Paso 2: la pregunta que debe contestar. */
  protected readonly pregunta = signal<string | null>(null);
  protected readonly respuesta = signal('');
  protected readonly intentado = signal(false);
  protected readonly error = signal<string | null>(null);
  /** No se puede recuperar en línea (o se anuló): aviso para ir a la sucursal. */
  protected readonly sinRecuperacion = signal<string | null>(null);
  /** Correo enmascarado al que se envió la temporal. */
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
    this.sinRecuperacion.set(null);
    this.portal.iniciarRecuperacion(this.formulario.getRawValue().correo).subscribe((r) => {
      this.enviando.set(false);
      if ('mensaje' in r) {
        this.sinRecuperacion.set(r.mensaje);
        return;
      }
      this.pregunta.set(r.pregunta);
      setTimeout(() => this.elemento.nativeElement.querySelector<HTMLInputElement>('#respuesta')?.focus());
    });
  }

  protected escribir(valor: string): void {
    this.respuesta.set(valor);
    this.error.set(null);
  }

  protected responder(): void {
    this.intentado.set(true);
    if (!this.respuesta().trim() || this.enviando()) return;
    this.enviando.set(true);
    this.portal.responderRecuperacion(this.respuesta()).subscribe((r) => {
      this.enviando.set(false);
      if (r.ok) {
        this.enviado.set(r.correo);
        return;
      }
      this.respuesta.set('');
      this.intentado.set(false);
      if (r.anulada) {
        this.pregunta.set(null);
        this.sinRecuperacion.set(r.mensaje);
      } else this.error.set(r.mensaje);
    });
  }

  /** Otro correo: de vuelta al paso 1. */
  protected cambiarCorreo(): void {
    this.pregunta.set(null);
    this.respuesta.set('');
    this.intentado.set(false);
    this.error.set(null);
  }
}
