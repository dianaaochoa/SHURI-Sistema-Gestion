import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortalMarcaComponent } from '../compartido/portal-marca.component';
import { PortalPieComponent } from '../compartido/portal-pie.component';
import { PortalService } from '../portal.service';

/** P1.3 · ¿Olvidaste tu contraseña? Envía una temporal al correo registrado. */
@Component({
  selector: 'app-olvide-portal',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PortalMarcaComponent, PortalPieComponent],
  templateUrl: './olvide-portal.component.html',
  styleUrls: ['../portal.css'],
})
export class OlvidePortalComponent {
  private readonly portal = inject(PortalService);

  protected readonly formulario = inject(NonNullableFormBuilder).group({ correo: ['', [Validators.required, Validators.email]] });
  protected readonly enviando = signal(false);
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
    const correo = this.formulario.getRawValue().correo.trim();
    this.enviando.set(true);
    this.portal.solicitarTemporal(correo).subscribe(() => {
      this.enviando.set(false);
      this.enviado.set(correo);
    });
  }
}
