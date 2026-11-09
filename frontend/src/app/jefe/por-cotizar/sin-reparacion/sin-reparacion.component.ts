import { Component, computed, inject, input, output, signal } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { Orden, OrdenesService } from '../../../cajera/ordenes/ordenes.service';
import { formatearDinero } from '../../../compartido/formato';
import { REGLAS_TALLER } from '../../../compartido/reglas-taller';

/** J3.3 · Confirmar equipo sin reparación. */
@Component({
  selector: 'app-sin-reparacion',
  standalone: true,
  templateUrl: './sin-reparacion.component.html',
  styles: `
    .modal { max-width: 600px; }
    .motivo { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 8px; background: var(--color-fondo); font-size: 13px; line-height: 17px; color: var(--color-marino); }
    .motivo strong { font-weight: 600; }
    .fotos { display: flex; gap: 8px; }
    .texto { padding: 10px 12px; border: 1px solid var(--color-borde); border-radius: var(--radio-control); font: inherit; font-size: 14px; color: var(--color-marino); resize: vertical; }
    .texto:focus { border-color: var(--color-primario); outline: 0; }
    .cobro { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; border: 0; }
    .cobro legend { margin-bottom: 12px; padding: 0; }
    .boton .icono { width: 16px; height: 16px; }
    .confirmar { border: 1px solid var(--color-peligro); background: var(--color-superficie); color: var(--color-peligro); }
    .confirmar:hover { background: var(--color-peligro-suave); }
  `,
})
export class SinReparacionComponent {
  private readonly servicio = inject(OrdenesService);
  private readonly jefe = inject(AuthService).sesion()?.nombre ?? '';

  readonly orden = input.required<Orden>();
  readonly cerrar = output<void>();
  readonly confirmado = output<string>();
  readonly regresar = output<void>();

  protected readonly dinero = formatearDinero;
  /** El nivel "Revisión / diagnóstico" del tabulador (Configuración J9). */
  protected readonly cobro = REGLAS_TALLER.revision;

  protected readonly mensaje = signal<string | null>(null);
  protected readonly mensajeElegido = computed(() => this.mensaje() ?? `${this.orden().sinReparacion?.texto ?? ''} Se devuelve armado, como llegó.`.trim());
  protected readonly cobrar = signal(true);

  /** Qué pasa con el anticipo en cada opción. */
  protected readonly detalleCobrar = computed(() => {
    const anticipo = this.orden().anticipo;
    if (anticipo >= this.cobro) {
      const sobra = anticipo - this.cobro;
      return `Queda cubierto con el anticipo · ${sobra ? `se devuelven ${formatearDinero(sobra)}` : `saldo ${formatearDinero(0)}`}`;
    }
    return anticipo ? `Se usa el anticipo · saldo ${formatearDinero(this.cobro - anticipo)} al entregar` : `Se cobra ${formatearDinero(this.cobro)} al entregar`;
  });
  protected readonly detalleNoCobrar = computed(() => (this.orden().anticipo ? 'Se devuelve el anticipo en caja' : 'El cliente no paga nada'));

  protected confirmar(): void {
    const o = this.orden();
    if (!this.mensajeElegido().trim()) return;
    this.servicio.confirmarSinReparacion(o.folio, { mensaje: this.mensajeElegido(), cobrar: this.cobrar(), monto: this.cobro, por: this.jefe });
    const cobro = this.cobrar() ? `revisión de ${formatearDinero(this.cobro)}` : 'sin cobro de revisión';
    this.confirmado.emit(`${o.folio} confirmada sin reparación · ${cobro} · ${o.cliente.nombre.split(' ')[0]} recibe el aviso para recoger y caja la ve en Entrega`);
  }
}
