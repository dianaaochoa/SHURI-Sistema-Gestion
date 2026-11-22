import { Component, computed, input } from '@angular/core';
import { formatearDinero, formatearFechaCorta, formatearHora } from '../../../compartido/formato';
import type { MovimientoCliente } from '../../clientes/clientes.service';
import type { Cliente } from '../../punto-de-venta/clientes.datos';
import { NEGOCIO } from '../documentos.service';

/** C8.3 impreso · Historial del cliente en hoja carta: datos, totales y todos sus movimientos del periodo. */
@Component({
  selector: 'app-historial-carta',
  standalone: true,
  template: `
    <article class="carta hoja-impresion">
      <header class="encabezado">
        <div class="marca">
          <img src="assets/acceso/logo-shuri.png" width="40" height="40" alt="" />
          <div><strong>{{ negocio.nombre }}</strong><span>{{ negocio.direccionLarga }}</span><span>{{ negocio.web }} · RFC {{ negocio.rfc }}</span></div>
        </div>
        <div class="titulo">
          <span>HISTORIAL DEL CLIENTE</span>
          <strong>{{ cliente().nombre }}</strong>
          <span>{{ periodo() }} · impreso el {{ hoy }}</span>
        </div>
      </header>

      <section class="datos">
        <p><span>Teléfono</span>{{ cliente().telefono || '—' }}</p>
        <p><span>Correo</span>{{ cliente().correo || '—' }}</p>
        <p><span>Movimientos</span>{{ movimientos().length }}</p>
        <p><span>Total pagado</span><strong>{{ dinero(total()) }}</strong></p>
      </section>

      <table>
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Folio</th><th>Descripción</th><th class="num">Importe</th><th class="num">Pagado</th><th>Estado</th></tr></thead>
        <tbody>
          @for (m of movimientos(); track m.folio + m.tipo) {
            <tr>
              <td>{{ fecha(m.fecha) }}</td>
              <td>{{ m.tipo }}</td>
              <td>{{ m.folio }}</td>
              <td>{{ m.descripcion }}</td>
              <td class="num">{{ m.monto === null ? 'Sin costo' : dinero(m.monto) }}</td>
              <td class="num">{{ dinero(m.pagado) }}</td>
              <td>{{ m.estado.texto }}</td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="vacio">Sin movimientos en este periodo.</td></tr>
          }
        </tbody>
      </table>

      <footer class="pie">Documento informativo, no es comprobante fiscal. Facturas en {{ negocio.web }}/factura con el folio de cada compra.</footer>
    </article>
  `,
  styles: `
    .carta { width: 816px; min-height: 1056px; padding: 40px 48px; background: #fff; font-size: 12px; color: #17374e; }
    .encabezado { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 16px; border-bottom: 2px solid #17374e; }
    .marca { display: flex; gap: 12px; }
    .marca div, .titulo { display: flex; flex-direction: column; gap: 2px; }
    .marca strong { font-size: 18px; }
    .titulo { align-items: flex-end; text-align: right; }
    .titulo span:first-child { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; }
    .titulo strong { font-size: 18px; }
    .datos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; }
    .datos p { display: flex; flex-direction: column; gap: 2px; }
    .datos span { font-size: 10px; font-weight: 600; text-transform: uppercase; color: #64748b; }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 8px 6px; border-bottom: 1px solid #17374e; font-size: 10px; text-align: left; text-transform: uppercase; }
    td { padding: 7px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    .num, td:nth-child(1), td:nth-child(3) { white-space: nowrap; }
    .num { text-align: right; }
    .vacio { padding: 24px; text-align: center; color: #64748b; }
    .pie { margin-top: 24px; font-size: 10px; color: #64748b; }
  `,
})
export class HistorialCartaComponent {
  readonly cliente = input.required<Cliente>();
  readonly movimientos = input.required<MovimientoCliente[]>();
  readonly periodo = input('Todo el historial');

  protected readonly negocio = NEGOCIO;
  protected readonly hoy = formatearFechaCorta(new Date());
  protected readonly dinero = formatearDinero;
  protected readonly total = computed(() => this.movimientos().reduce((s, m) => s + m.pagado, 0));

  protected fecha(iso: string): string {
    const f = new Date(iso);
    return `${formatearFechaCorta(f)} ${formatearHora(f)}`;
  }
}
