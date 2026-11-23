import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { REQUISITOS } from '../../acceso/contrasena';
import { PortalMarcaComponent } from '../compartido/portal-marca.component';
import { PortalPieComponent } from '../compartido/portal-pie.component';
import { PortalService } from '../portal.service';

const NIVELES = [
  { etiqueta: 'Muy débil', color: 'var(--color-peligro)' },
  { etiqueta: 'Débil', color: 'var(--color-peligro)' },
  { etiqueta: 'Débil', color: 'var(--color-peligro)' },
  { etiqueta: 'Media', color: 'var(--color-advertencia)' },
  { etiqueta: 'Segura', color: 'var(--color-exito)' },
];

const segura = (c: AbstractControl<string>): ValidationErrors | null => (REQUISITOS.every((r) => r.cumple(c.value)) ? null : { insegura: true });
const iguales = (g: AbstractControl): ValidationErrors | null => {
  const { nueva, repetida } = g.value as { nueva: string; repetida: string };
  return repetida && nueva !== repetida ? { noCoinciden: true } : null;
};

/** P1.4 · Crea tu nueva contraseña (después de entrar con la temporal). Mismas reglas que el personal (A.5). */
@Component({
  selector: 'app-crear-portal',
  standalone: true,
  imports: [ReactiveFormsModule, PortalMarcaComponent, PortalPieComponent],
  templateUrl: './crear-portal.component.html',
  styleUrls: ['../portal.css', '../../acceso/crear-contrasena/crear-contrasena.component.css'],
})
export class CrearPortalComponent {
  private readonly portal = inject(PortalService);
  private readonly router = inject(Router);

  protected readonly formulario = inject(NonNullableFormBuilder).group(
    {
      nueva: ['', [Validators.required, segura]],
      repetida: ['', Validators.required],
      pregunta: ['', Validators.required],
      respuesta: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    },
    { validators: iguales },
  );
  /** Catálogo de preguntas secretas (GET /security-questions). */
  protected readonly preguntas = toSignal(this.portal.preguntasSecretas(), { initialValue: [] });
  protected readonly error = signal('');

  protected campoInvalido(nombre: 'pregunta' | 'respuesta'): boolean {
    const c = this.formulario.controls[nombre];
    return c.invalid && c.touched;
  }
  protected readonly verNueva = signal(false);
  protected readonly verRepetida = signal(false);
  protected readonly enviando = signal(false);

  private readonly nueva = toSignal(this.formulario.controls.nueva.valueChanges, { initialValue: '' });
  protected readonly requisitos = computed(() => REQUISITOS.map((r) => ({ texto: r.texto, cumple: r.cumple(this.nueva()) })));
  protected readonly puntaje = computed(() => this.requisitos().filter((r) => r.cumple).length);
  protected readonly nivel = computed(() => NIVELES[this.puntaje()]);
  protected readonly barras = [1, 2, 3, 4];

  protected get nuevaInvalida(): boolean {
    const c = this.formulario.controls.nueva;
    return c.invalid && c.touched;
  }

  protected get repetidaInvalida(): boolean {
    const c = this.formulario.controls.repetida;
    return c.touched && (c.invalid || this.formulario.hasError('noCoinciden'));
  }

  protected guardar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    const { nueva, pregunta, respuesta } = this.formulario.getRawValue();
    this.enviando.set(true);
    this.error.set('');
    this.portal.crearContrasena(nueva, { pregunta, respuesta }).subscribe((r) => {
      this.enviando.set(false);
      if (r.ok) this.router.navigateByUrl('/portal/mis-equipos');
      else this.error.set(r.mensaje);
    });
  }

  protected salir(): void {
    this.portal.cerrarSesion();
    this.router.navigateByUrl('/portal');
  }
}
