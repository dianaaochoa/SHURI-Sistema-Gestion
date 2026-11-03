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
}
