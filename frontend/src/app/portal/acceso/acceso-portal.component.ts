import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PortalMarcaComponent } from '../compartido/portal-marca.component';
import { PortalPieComponent } from '../compartido/portal-pie.component';
import { PortalService } from '../portal.service';

/** P1.1 · Rastrea tu equipo: el cliente entra con su correo y contraseña. */
@Component({
  selector: 'app-acceso-portal',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PortalMarcaComponent, PortalPieComponent],
  templateUrl: './acceso-portal.component.html',
  styleUrls: ['../portal.css'],
})
export class AccesoPortalComponent {
  private readonly portal = inject(PortalService);
  private readonly router = inject(Router);

  protected readonly formulario = inject(NonNullableFormBuilder).group({
    correo: ['', [Validators.required, Validators.email]],
    contrasena: ['', Validators.required],
  });
  protected readonly ver = signal(false);
  protected readonly enviando = signal(false);
  protected readonly error = signal('');

  protected invalido(campo: 'correo' | 'contrasena'): boolean {
    const c = this.formulario.controls[campo];
    return c.invalid && c.touched;
  }

  protected entrar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    const { correo, contrasena } = this.formulario.getRawValue();
    this.enviando.set(true);
    this.error.set('');
    this.portal.iniciarSesion(correo, contrasena).subscribe((r) => {
      this.enviando.set(false);
      if (r.ok) this.router.navigateByUrl(r.sesion.temporal ? '/portal/crear-contrasena' : '/portal/mis-equipos');
      else {
        this.error.set(r.mensaje);
        this.formulario.controls.contrasena.reset();
      }
    });
  }
}
