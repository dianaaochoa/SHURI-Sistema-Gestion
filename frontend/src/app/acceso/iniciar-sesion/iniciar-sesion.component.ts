import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, ResultadoInicioSesion, RetoMfa } from '../auth.service';

/** Segundos de espera para pedir otro código (la API permite uno por minuto). */
const ESPERA_REENVIO = 60;

/** A.1 Inicio de sesión · A.2 datos incorrectos · A.1b código de verificación (MFA) */
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
    .iniciar-sesion__codigo {
      font-size: 22px;
      letter-spacing: 8px;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class IniciarSesionComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly formulario = this.fb.group({
    usuario: ['', Validators.required],
    contrasena: ['', Validators.required],
    recordar: [true],
  });

  /**
   * Paso 2 (MFA): el código de 6 dígitos que llegó por correo. Va en su propio formGroup:
   * sin él, Angular no atrapa el envío y el navegador recargaría la página.
   */
  readonly formularioCodigo = this.fb.group({
    codigo: ['', [Validators.required, Validators.pattern(/^\s*\d{3}[\s-]?\d{3}\s*$/)]],
  });
  readonly codigo = this.formularioCodigo.controls.codigo;

  readonly verContrasena = signal(false);
  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);
  /** Si existe, se muestra el paso del código en lugar del usuario y la contraseña. */
  readonly reto = signal<RetoMfa | null>(null);
  readonly aviso = signal<string | null>(null);
  readonly segundosReenvio = signal(0);
  private temporizador?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    const usuario = this.route.snapshot.queryParamMap.get('usuario');
    // Aviso que deja la pantalla de la pregunta (p. ej. la cuenta se bloqueó).
    const aviso = (history.state as { aviso?: string } | null)?.aviso;
    if (aviso) setTimeout(() => this.error.set(aviso));
    if (usuario) this.formulario.controls.usuario.setValue(usuario);

    // El aviso de error se quita en cuanto la persona corrige sus datos.
    this.formulario.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.error.set(null));
    this.codigo.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.error.set(null));
    this.destroyRef.onDestroy(() => clearInterval(this.temporizador));
  }

  campoInvalido(nombre: 'usuario' | 'contrasena'): boolean {
    const control = this.formulario.controls[nombre];
    return control.invalid && control.touched;
  }

  get codigoInvalido(): boolean {
    return this.codigo.invalid && this.codigo.touched;
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
      if (!resultado.ok && resultado.mfa) {
        // Contraseña correcta: falta el código que se mandó por correo
        this.reto.set(resultado.mfa);
        this.aviso.set(resultado.mfa.mensaje);
        this.codigo.reset('');
        this.iniciarEspera();
        return;
      }
      this.continuar(resultado);
    });
  }

  verificarCodigo(): void {
    const reto = this.reto();
    if (!reto) return;
    if (this.codigo.invalid) {
      this.codigo.markAsTouched();
      return;
    }

    this.enviando.set(true);
    this.auth.verificarCodigo(reto.retoId, this.codigo.value.replace(/\D/g, '')).subscribe((resultado) => {
      this.enviando.set(false);
      this.continuar(resultado);
    });
  }

  reenviarCodigo(): void {
    const reto = this.reto();
    if (!reto || this.segundosReenvio() > 0) return;

    this.auth.reenviarCodigo(reto.retoId).subscribe((r) => {
      if (r.ok) {
        this.aviso.set(r.mensaje);
        this.error.set(null);
        this.iniciarEspera();
      } else {
        this.error.set(r.mensaje);
      }
    });
  }

  /** Regresa a escribir usuario y contraseña (por ejemplo, si el código venció). */
  volver(): void {
    clearInterval(this.temporizador);
    this.reto.set(null);
    this.aviso.set(null);
    this.error.set(null);
    this.formulario.controls.contrasena.reset('');
  }

  private continuar(resultado: ResultadoInicioSesion): void {
    if (!resultado.ok) {
      this.error.set(resultado.mensaje);
      return;
    }
    this.router.navigateByUrl(resultado.sesion.requiereCambioContrasena ? '/crear-contrasena' : '/inicio');
  }

  private iniciarEspera(): void {
    clearInterval(this.temporizador);
    this.segundosReenvio.set(ESPERA_REENVIO);
    this.temporizador = setInterval(() => {
      const restantes = this.segundosReenvio() - 1;
      this.segundosReenvio.set(Math.max(restantes, 0));
      if (restantes <= 0) clearInterval(this.temporizador);
    }, 1000);
  }
}
