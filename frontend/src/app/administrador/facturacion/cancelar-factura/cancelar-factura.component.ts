import { Component, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { formatearDinero } from '../../../compartido/formato';
import { Cfdi, FacturacionService, MOTIVOS_CANCELACION, MotivoCancelacion, diaFactura, serieFolio } from '../../facturacion.service';

/** AD6.2 · Cancelar factura con motivo del SAT. */
@Component({
  selector: 'app-cancelar-factura',
  standalone: true,
  templateUrl: './cancelar-factura.component.html',
  styleUrls: ['../../../tecnico/banco/modal-banco.css'],
  styles: ['.solo-lectura { background: var(--color-fondo); } .solo-lectura input { color: var(--color-texto-secundario); } .aviso--advertencia .icono { color: inherit; }'],
})
export class CancelarFacturaComponent {
  private readonly servicio = inject(FacturacionService);

  readonly factura = input.required<Cfdi>();
  readonly cerrar = output<void>();
  readonly cancelada = output<string>();

  protected readonly motivos = Object.entries(MOTIVOS_CANCELACION) as [MotivoCancelacion, { texto: string; detalle: string }][];
  protected readonly motivo = signal<MotivoCancelacion>('01');

  protected readonly id = computed(() => serieFolio(this.factura()));
  protected readonly subtitulo = computed(() => {
    const f = this.factura();
    return `${f.cliente} · ${f.rfc} · ${formatearDinero(f.total)} · timbrada ${diaFactura(f.fecha).toLowerCase()}`;
  });
  protected readonly sustituta = computed(() => `${serieFolio({ serie: 'A', folio: this.servicio.siguienteFolio() })} · se generará con los datos corregidos`);

  protected confirmar(): void {
    const id = this.id();
    const sustituta = this.servicio.cancelar(id, this.motivo());
    this.cancelada.emit(`Factura ${id} cancelada (motivo ${this.motivo()})${sustituta ? `; la sustituye ${sustituta}` : ''}.`);
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}
