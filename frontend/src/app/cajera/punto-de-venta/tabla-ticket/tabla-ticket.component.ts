import { Component, inject } from '@angular/core';
import { formatearDinero } from '../../../compartido/formato';
import { VentaService, totalLinea } from '../venta.service';

/** Tabla del ticket (Figma C2.1): cantidad con −/+, descuento por línea y quitar. */
@Component({
  selector: 'app-tabla-ticket',
  standalone: true,
  templateUrl: './tabla-ticket.component.html',
  styleUrl: './tabla-ticket.component.css',
})
export class TablaTicketComponent {
  protected readonly venta = inject(VentaService);
  protected readonly dinero = formatearDinero;
  protected readonly totalLinea = totalLinea;

  /** Supr con la fila enfocada (no dentro del campo de descuento) quita el artículo y enfoca la siguiente. */
  protected alSuprimir(evento: Event, sku: string): void {
    if (evento.target !== evento.currentTarget) return;
    const fila = evento.currentTarget as HTMLElement;
    const vecina = (fila.nextElementSibling ?? fila.previousElementSibling) as HTMLElement | null;
    this.venta.quitar(sku);
    vecina?.focus();
  }
}
