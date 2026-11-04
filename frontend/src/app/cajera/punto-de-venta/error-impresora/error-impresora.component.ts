import { Component, HostListener, input, output } from '@angular/core';
import { formatearDinero } from '../../../compartido/formato';
import { VentaCobrada } from '../venta.service';

/** C2.15 · Error de impresora (modal): la venta ya quedó cobrada, solo falló el ticket. */
@Component({
  selector: 'app-error-impresora',
  standalone: true,
  template: `
    <div class="modal-fondo" (click)="continuar.emit()">
      <section class="modal impresora" role="alertdialog" aria-modal="true" aria-labelledby="titulo-impresora" (click)="$event.stopPropagation()">
        <span class="impresora__cobrada">
          <img src="assets/pdv/circle-check-exito.svg" width="14" height="14" alt="" />Venta {{ venta().folio }} cobrada · {{ dinero(venta().total) }}
        </span>
        <span class="impresora__icono"><img src="assets/pdv/printer-peligro.svg" width="26" height="26" alt="" /></span>
        <h2 class="impresora__titulo" id="titulo-impresora">No se pudo imprimir el ticket</h2>
        <p class="impresora__texto">
          La impresora térmica no responde. Revisa que esté encendida, con papel y conectada. La venta ya quedó registrada.
        </p>
        @if (intentos() > 1) {
          <p class="impresora__intentos" role="status">Sigue sin responder ({{ intentos() }} intentos).</p>
        }
        <div class="impresora__acciones">
          <button type="button" class="boton boton--primario boton--44" (click)="reintentar.emit()">
            <img src="assets/pdv/refresh-blanco.svg" width="16" height="16" alt="" />Reintentar impresión
          </button>
          <button
            type="button"
            class="boton boton--contorno boton--44"
            [disabled]="!correo()"
            [attr.title]="correo() ? 'Se envía a ' + correo() : 'El cliente no tiene correo registrado'"
            (click)="enviarCorreo.emit()"
          >
            <img src="assets/pdv/send-primario.svg" width="16" height="16" alt="" />Enviar ticket por correo
          </button>
          <button type="button" class="boton impresora__continuar" (click)="continuar.emit()">Continuar sin imprimir</button>
        </div>
        <p class="impresora__nota">Puedes reimprimirlo después desde Ventas (Ctrl+P).</p>
      </section>
    </div>
  `,
  styles: `
    .impresora { align-items: center; max-width: 480px; text-align: center; }
    .impresora__cobrada { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 999px; background: var(--color-exito-suave); font-size: 12px; font-weight: 600; color: var(--color-exito); }
    .impresora__icono { display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 999px; background: var(--color-peligro-suave); }
    .impresora__titulo { font-size: 18px; font-weight: 700; color: var(--color-marino); }
    .impresora__texto { font-size: 13px; color: var(--color-texto-tenue); }
    .impresora__intentos { font-size: 12px; font-weight: 600; color: var(--color-peligro); }
    .impresora__acciones { display: flex; flex-direction: column; gap: 8px; width: 100%; }
    .impresora__continuar { height: 40px; background: none; color: var(--color-primario); }
    .impresora__continuar:hover { background: var(--color-primario-suave); }
    .impresora__nota { font-size: 11px; color: var(--color-texto-tenue); }
  `,
})
export class ErrorImpresoraComponent {
  readonly venta = input.required<VentaCobrada>();
  /** Correo del cliente; sin correo no se puede enviar el ticket. */
  readonly correo = input<string | undefined>();
  readonly intentos = input(1);

  readonly reintentar = output<void>();
  readonly enviarCorreo = output<void>();
  readonly continuar = output<void>();

  protected readonly dinero = formatearDinero;

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    this.continuar.emit();
  }
}
