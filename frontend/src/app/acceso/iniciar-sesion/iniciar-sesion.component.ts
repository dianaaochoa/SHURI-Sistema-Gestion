import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

/** A.1 Inicio de sesión · A.2 datos incorrectos */
@Component({
  selector: 'app-iniciar-sesion',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './iniciar-sesion.component.html',
  styles: `
    .iniciar-sesion__opciones {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }
    .iniciar-sesion__opciones .enlace { align-self: auto; }
  `,
})
export class IniciarSesionComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly formulario = inject(NonNullableFormBuilder).group({
    usuario: ['', Validators.required],
    contrasena: ['', Validators.required],
    recordar: [true],
  });

  readonly verContrasena = signal(false);
  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const usuario = this.route.snapshot.queryParamMap.get('usuario');
    if (usuario) this.formulario.controls.usuario.setValue(usuario);

    // El aviso de error se quita en cuanto la persona corrige sus datos.
    this.formulario.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.error.set(null));
  }

  campoInvalido(nombre: 'usuario' | 'contrasena'): boolean {
    const control = this.formulario.controls[nombre];
    return control.invalid && control.touched;
  }

  iniciarSesion(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const { usuario, contrasena, recordar } = this.formulario.getRawValue();
    this.enviando.set(true);
    this.auth.iniciarSesion(usuario, contrasena, recordar).subscribe((resultado) => {
      this.enviando.set(false);
      if (!resultado.ok) {
        this.error.set(resultado.mensaje);
        return;
      }
      this.router.navigateByUrl(resultado.sesion.requiereCambioContrasena ? '/crear-contrasena' : '/inicio');
    });
  }
}
