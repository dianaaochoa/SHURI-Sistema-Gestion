import { Component, HostListener, inject, input, output, signal } from '@angular/core';
import { CuentaUsuario } from '../../../acceso/auth.service';
import { UsuariosService } from '../../usuarios.service';

/**
 * AD7.4 · Asignar contraseña temporal (pedido de "¿Olvidaste tu contraseña?" o desde Editar).
 * La genera el servidor: la manda al correo del empleado, desbloquea la cuenta y cierra sus
 * sesiones. Aquí se muestra una sola vez por si hay que entregarla en persona.
 */
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
    .copiar .icono, .clave .icono { width: 18px; height: 18px; }`,
  ],
})
export class AsignarTemporalComponent {
  private readonly usuarios = inject(UsuariosService);

  readonly cuenta = input.required<CuentaUsuario>();
  readonly cerrar = output<void>();
  readonly asignada = output<string>();

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Contraseña que generó el servidor (solo se ve aquí, una vez). */
  protected readonly clave = signal<string | null>(null);
  protected readonly correoEnviado = signal(false);
  protected readonly copiado = signal(false);

  protected readonly primerNombre = () => this.cuenta().nombre.split(' ')[0];

  protected asignar(): void {
    const id = this.cuenta().id;
    if (!id || this.enviando()) return;
    this.enviando.set(true);
    this.error.set(null);
    this.usuarios.asignarTemporal(id).subscribe((r) => {
      this.enviando.set(false);
      if (!r.ok || !r.temporal) {
        this.error.set(r.mensaje);
        return;
      }
      this.clave.set(r.temporal);
      this.correoEnviado.set(!!r.correoEnviado);
    });
  }

  protected copiar(): void {
    const clave = this.clave();
    if (!clave) return;
    navigator.clipboard?.writeText(clave).then(
      () => this.copiado.set(true),
      () => this.copiado.set(false),
    );
  }

  /** Cierra el modal con el resumen para el aviso de la lista. */
  protected listo(): void {
    const c = this.cuenta();
    const correo = this.correoEnviado() ? `Se la enviamos a ${c.correo}` : 'No se pudo enviar el correo: entrégasela en persona';
    this.asignada.emit(`Contraseña temporal asignada a ${c.nombre}. ${correo}. Su cuenta quedó desbloqueada y se cerraron sus sesiones.`);
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    if (this.clave()) this.listo();
    else this.cerrar.emit();
  }
}
