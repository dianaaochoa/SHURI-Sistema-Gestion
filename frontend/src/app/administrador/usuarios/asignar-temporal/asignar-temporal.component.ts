import { Component, HostListener, inject, input, output, signal } from '@angular/core';
import { AuthService, CuentaUsuario } from '../../../acceso/auth.service';
import { generarTemporal } from '../temporal';

/** AD7.4 · Asignar contraseña temporal (pedido de "¿Olvidaste tu contraseña?" o desde Editar). */
@Component({
  selector: 'app-asignar-temporal',
  standalone: true,
  templateUrl: './asignar-temporal.component.html',
  styleUrls: ['../../../tecnico/banco/modal-banco.css'],
  styles: [
    `.clave { display: flex; gap: 8px; }
    .clave .campo__control { flex: 1; gap: 10px; }
    .clave input { font-size: 16px; font-weight: 600; letter-spacing: 1px; }
    .copiar { display: grid; place-items: center; padding: 0; border: 0; background: none; color: var(--color-texto-secundario); cursor: pointer; }
    .copiar .icono, .clave .icono { width: 18px; height: 18px; }
    .casilla { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-marino); cursor: pointer; }
    .casilla input { width: 16px; height: 16px; margin: 0; accent-color: var(--color-primario); }
    @media (max-width: 520px) { .clave { flex-wrap: wrap; } .clave .boton { flex: 1 1 100%; justify-content: center; } }`,
  ],
})
export class AsignarTemporalComponent {
  private readonly auth = inject(AuthService);

  readonly cuenta = input.required<CuentaUsuario>();
  readonly cerrar = output<void>();
  readonly asignada = output<string>();

  protected readonly clave = signal(generarTemporal());
  protected readonly cerrarSesiones = signal(true);
  protected readonly desbloquear = signal(true);
  protected readonly copiado = signal(false);

  protected readonly primerNombre = () => this.cuenta().nombre.split(' ')[0];

  protected otra(): void {
    this.clave.set(generarTemporal());
    this.copiado.set(false);
  }

  protected copiar(): void {
    navigator.clipboard?.writeText(this.clave()).then(
      () => this.copiado.set(true),
      () => this.copiado.set(false),
    );
  }

  protected asignar(): void {
    const c = this.cuenta();
    this.auth.asignarTemporal(c.usuario, this.clave(), this.desbloquear());
    const extra = [this.desbloquear() ? 'cuenta desbloqueada' : '', this.cerrarSesiones() ? 'sesiones en otros equipos cerradas' : ''].filter(Boolean).join(', ');
    this.asignada.emit(`Contraseña temporal ${this.clave()} asignada a ${c.nombre}${extra ? ` (${extra})` : ''}. Al entrar creará la suya.`);
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}
