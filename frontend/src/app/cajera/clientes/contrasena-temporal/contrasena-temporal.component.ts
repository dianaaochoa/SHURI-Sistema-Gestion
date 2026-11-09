import { Component, HostListener, inject, input, output, signal } from '@angular/core';
import { formatearHora } from '../../../compartido/formato';
import { Cliente } from '../../punto-de-venta/clientes.datos';
import { DispositivosService } from '../../punto-de-venta/dispositivos.service';

/** C8.4 · Contraseña temporal enviada (modal). */
@Component({
  selector: 'app-contrasena-temporal',
  standalone: true,
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <section class="modal temporal" role="dialog" aria-modal="true" aria-labelledby="titulo-temporal" (click)="$event.stopPropagation()">
        <header class="modal__encabezado">
          <div class="temporal__titulo">
            <span class="temporal__icono"><img src="assets/ordenes/circulo-check-exito.svg" width="20" height="20" alt="" /></span>
            <div>
              <h2 class="modal__titulo" id="titulo-temporal">Contraseña temporal enviada</h2>
              <p class="temporal__sub">{{ cliente().nombre }} · {{ cliente().correo }}</p>
            </div>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()">
            <img src="assets/inventario/x.svg" width="20" height="20" alt="" />
          </button>
        </header>

        <div class="codigo">
          <span>Contraseña temporal</span>
          <strong>{{ contrasena() }}</strong>
          <span>Enviada por correo hoy {{ hora }} · la anterior ya no funciona</span>
        </div>

        <p class="nota">
          <img src="assets/pdv/info.svg" width="16" height="16" alt="" />
          Cuando {{ nombre() }} entre al portal con esta contraseña, le pediremos crear una nueva. Si no le llega el correo, imprímela y entrégasela en mostrador.
        </p>
        @if (mensaje(); as m) {
          <p class="aviso aviso--advertencia" role="alert">{{ m }}</p>
        }

        <div class="modal__acciones">
          <button type="button" class="boton boton--secundario boton--40" (click)="imprimir()">
            <img src="assets/pdv/printer.svg" width="16" height="16" alt="" />Imprimir
          </button>
          <button type="button" class="boton boton--primario boton--40" (click)="cerrar.emit()">Listo</button>
        </div>
      </section>
    </div>
  `,
  styles: `
    .temporal { max-width: 480px; }
    .temporal__titulo { display: flex; align-items: center; gap: 12px; }
    .temporal__icono { display: flex; flex-shrink: 0; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 999px; background: var(--color-exito-suave); }
    .temporal__sub { margin-top: 2px; font-size: 13px; color: var(--color-texto-secundario); }
    .codigo { display: flex; flex-direction: column; gap: 4px; padding: 16px; border-radius: 8px; background: var(--color-primario-suave); font-size: 12px; color: var(--color-texto-secundario); }
    .codigo strong { font-size: 24px; font-weight: 700; letter-spacing: 0.04em; color: var(--color-primario); }
    .nota { display: flex; align-items: flex-start; gap: 8px; padding: 12px; border-radius: 8px; background: var(--color-fondo); font-size: 12px; line-height: 1.3; color: var(--color-marino); }
    .nota img { flex-shrink: 0; }
  `,
})
export class ContrasenaTemporalComponent {
  private readonly dispositivos = inject(DispositivosService);
  readonly cliente = input.required<Cliente>();
  readonly contrasena = input.required<string>();
  readonly cerrar = output<void>();

  protected readonly hora = formatearHora(new Date());
  protected readonly mensaje = signal<string | null>(null);
  protected nombre(): string {
    return this.cliente().nombre.split(' ')[0];
  }

  protected imprimir(): void {
    this.mensaje.set(this.dispositivos.imprimir(this.contrasena()) ? null : 'La impresora no responde: revisa que esté encendida, con papel y conectada.');
    if (!this.mensaje()) this.cerrar.emit();
  }

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    this.cerrar.emit();
  }
}
