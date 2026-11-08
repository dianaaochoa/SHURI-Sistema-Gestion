import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { REQUISITOS } from '../contrasena';

const NIVELES = [
  { etiqueta: 'Muy débil', color: 'var(--color-peligro)' },
  { etiqueta: 'Débil', color: 'var(--color-peligro)' },
  { etiqueta: 'Débil', color: 'var(--color-peligro)' },
  { etiqueta: 'Media', color: 'var(--color-advertencia)' },
  { etiqueta: 'Segura', color: 'var(--color-exito)' },
];

function contrasenaSegura(control: AbstractControl<string>): ValidationErrors | null {
  return REQUISITOS.every((r) => r.cumple(control.value)) ? null : { insegura: true };
}

function contrasenasIguales(grupo: AbstractControl): ValidationErrors | null {
  const { nueva, repetida } = grupo.value as { nueva: string; repetida: string };
  return repetida && nueva !== repetida ? { noCoinciden: true } : null;
}

/** A.5 Primer ingreso — crea tu contraseña */
@Component({
  selector: 'app-crear-contrasena',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './crear-contrasena.component.html',
  styleUrl: './crear-contrasena.component.css',
})
export class CrearContrasenaComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly formulario = inject(NonNullableFormBuilder).group(
    {
      nueva: ['', [Validators.required, contrasenaSegura]],
      repetida: ['', Validators.required],
    },
    { validators: contrasenasIguales },
  );

  readonly verNueva = signal(false);
  readonly verRepetida = signal(false);
  readonly enviando = signal(false);

  private readonly nueva = toSignal(this.formulario.controls.nueva.valueChanges, { initialValue: '' });

  readonly requisitos = computed(() => REQUISITOS.map((r) => ({ texto: r.texto, cumple: r.cumple(this.nueva()) })));
  readonly puntaje = computed(() => this.requisitos().filter((r) => r.cumple).length);
  readonly nivel = computed(() => NIVELES[this.puntaje()]);
  readonly barras = [1, 2, 3, 4];

  get nuevaInvalida(): boolean {
    const control = this.formulario.controls.nueva;
    return control.invalid && control.touched;
  }

  get repetidaInvalida(): boolean {
    const control = this.formulario.controls.repetida;
    return control.touched && (control.invalid || this.formulario.hasError('noCoinciden'));
  }

  guardar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    this.enviando.set(true);
    this.auth.crearContrasena(this.formulario.getRawValue().nueva).subscribe(() => {
      this.enviando.set(false);
      this.router.navigateByUrl('/inicio');
    });
  }

  salir(): void {
    this.auth.cerrarSesion();
    this.router.navigateByUrl('/iniciar-sesion');
  }
}
