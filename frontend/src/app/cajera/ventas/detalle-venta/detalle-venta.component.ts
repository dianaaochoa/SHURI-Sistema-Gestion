import { Component, computed, input, output } from '@angular/core';
import { formatearDinero, formatearHora } from '../../../compartido/formato';
import { totalLinea } from '../../punto-de-venta/venta.service';
import { DIAS_DEVOLUCION, ESTADOS, METODOS, VentaRegistrada, articulosDe, reembolsado } from '../historial-ventas.service';

const FORMAS = { efectivo: 'en efectivo', tarjeta: 'a la tarjeta', nota: 'en nota de crédito', cambio: 'en cambio por otro' };

/** Fecha corta del historial: "13 oct · 13:42". */
export function fechaVenta(iso: string): string {
  const fecha = new Date(iso);
  const mes = fecha.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');
  return `${fecha.getDate()} ${mes} · ${formatearHora(fecha)}`;
}

/** C3.1 · Panel con el detalle del ticket seleccionado. */
@Component({
  selector: 'app-detalle-venta',
  standalone: true,
  template: `
    @if (venta(); as v) {
    <header class="detalle__encabezado">
      <div>
        <h2 class="detalle__titulo">Ticket {{ v.folio }}</h2>
        <p class="detalle__subtitulo">{{ fecha(v.fecha) }} · {{ v.cliente.nombre }} · {{ v.cajera }}</p>
      </div>
      <span class="estado estado--{{ estados[v.estado].tono }}">{{ estados[v.estado].texto }}</span>
    </header>

    @for (linea of v.lineas; track linea.sku) {
      <p class="detalle__fila">
        <span>{{ linea.cantidad }} × {{ linea.nombre }}{{ linea.descuento ? ' (−' + linea.descuento + ' %)' : '' }}</span>
        <strong>{{ dinero(totalLinea(linea)) }}</strong>
      </p>
    }
    <hr class="detalle__separador" />
    @if (v.descuento) {
      <p class="detalle__fila detalle__fila--tenue">
        <span>Descuento a la venta ({{ v.descuento.modo === '%' ? v.descuento.valor + ' %' : dinero(v.descuento.valor) }})</span>
        <strong>{{ v.descuento.motivo }}</strong>
      </p>
    }
    <p class="detalle__fila detalle__fila--tenue"><span>Subtotal</span><strong>{{ dinero(v.subtotal) }}</strong></p>
    <p class="detalle__fila detalle__fila--tenue"><span>IVA 16 %</span><strong>{{ dinero(v.iva) }}</strong></p>
    <p class="detalle__fila detalle__total"><span>Total</span><strong>{{ dinero(v.total) }}</strong></p>
    <p class="detalle__fila detalle__fila--tenue"><span>{{ pago().etiqueta }}</span><strong>{{ pago().valor }}</strong></p>

    @for (devolucion of v.devoluciones; track devolucion.fecha) {
      <p class="detalle__fila detalle__devolucion">
        <span>Devolución {{ fecha(devolucion.fecha) }} · {{ devolucion.motivo }}</span>
        <strong>−{{ dinero(devolucion.monto) }} {{ formas[devolucion.forma] }}</strong>
      </p>
    }

    <div class="detalle__espacio"></div>

    <p class="aviso detalle__aviso">
      <img src="assets/pdv/alert-primario.svg" width="16" height="16" alt="" />
      Las devoluciones se aceptan hasta {{ dias }} días después de la compra, con el ticket y el empaque original.
    </p>
    <div class="detalle__acciones">
      <button type="button" class="boton boton--contorno boton--40" (click)="reimprimir.emit()">
        <img src="assets/ventas/printer-primario.svg" width="16" height="16" alt="" />Reimprimir
      </button>
      <button
        type="button"
        class="boton boton--contorno boton--40"
        [disabled]="!v.cliente.correo"
        [attr.title]="v.cliente.correo ? 'Se envía a ' + v.cliente.correo : 'El cliente no tiene correo registrado'"
        (click)="enviar.emit()"
      >
        <img src="assets/pdv/send-primario.svg" width="16" height="16" alt="" />Enviar
      </button>
    </div>
    <div class="detalle__acciones">
      <button
        type="button"
        class="boton boton--44 detalle__cancelar"
        [disabled]="v.estado !== 'pagada'"
        [attr.title]="v.estado === 'pagada' ? null : 'Solo se cancelan ventas pagadas y sin devoluciones'"
        (click)="cancelar.emit()"
      >
        <img src="assets/ventas/x-peligro.svg" width="16" height="16" alt="" />Cancelar venta
      </button>
      <button type="button" class="boton boton--primario boton--44" [disabled]="motivoSinDevolucion() !== null" [attr.title]="motivoSinDevolucion()" (click)="devolver.emit()">
        <img src="assets/ventas/undo-blanco.svg" width="16" height="16" alt="" />Devolución
      </button>
    </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid var(--color-borde); border-radius: 8px; background: var(--color-superficie); }
    .detalle__encabezado { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .detalle__titulo { font-size: 16px; font-weight: 700; color: var(--color-marino); }
    .detalle__subtitulo { margin-top: 4px; font-size: 12px; color: var(--color-texto-tenue); }
    .detalle__fila { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--color-texto-secundario); }
    .detalle__fila strong { flex-shrink: 0; font-weight: 600; color: var(--color-marino); }
    .detalle__fila--tenue { color: var(--color-texto-tenue); }
    .detalle__total { font-weight: 600; color: var(--color-marino); }
    .detalle__total strong { font-size: 20px; font-weight: 700; }
    .detalle__devolucion, .detalle__devolucion strong { color: var(--color-advertencia); }
    .detalle__separador { margin: 0; border: 0; border-top: 1px solid var(--color-borde); }
    .detalle__espacio { flex: 1; }
    .detalle__aviso { background: var(--color-primario-suave); }
    .detalle__acciones { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .detalle__acciones .boton { padding: 0 14px; white-space: nowrap; }
    .detalle__cancelar { border: 1px solid var(--color-peligro); background: var(--color-superficie); color: var(--color-peligro); }
    .detalle__cancelar:hover:not(:disabled) { background: var(--color-peligro-suave); }
  `,
})
export class DetalleVentaComponent {
  readonly venta = input.required<VentaRegistrada>();
  readonly reimprimir = output<void>();
  readonly enviar = output<void>();
  readonly cancelar = output<void>();
  readonly devolver = output<void>();

  protected readonly dinero = formatearDinero;
  protected readonly fecha = fechaVenta;
  protected readonly totalLinea = totalLinea;
  protected readonly estados = ESTADOS;
  protected readonly formas = FORMAS;
  protected readonly dias = DIAS_DEVOLUCION;

  protected readonly pago = computed(() => {
    const v = this.venta();
    switch (v.metodo) {
      case 'efectivo':
        return { etiqueta: 'Pagó en efectivo', valor: `${this.dinero(v.recibido)} · Cambio ${this.dinero(v.cambio)}` };
      case 'tarjeta':
        return { etiqueta: 'Pagó con tarjeta', valor: v.referencia ? `Autorización ${v.referencia}` : METODOS.tarjeta };
      case 'transferencia':
        return { etiqueta: 'Pagó por transferencia', valor: v.referencia ? `Rastreo ${v.referencia}` : METODOS.transferencia };
      case 'mixto':
        return {
          etiqueta: 'Pagó mixto',
          valor: (v.partes ?? []).map((p) => `${METODOS[p.metodo]} ${this.dinero(p.monto ?? 0)}`).join(' · '),
        };
    }
  });

  /** null si se puede devolver; si no, el motivo (tooltip del botón). */
  protected readonly motivoSinDevolucion = computed(() => {
    const v = this.venta();
    if (v.estado === 'cancelada') return 'La venta está cancelada';
    if (v.estado === 'devuelta' || reembolsado(v) >= v.total || articulosDe(v) === 0) return 'Ya se devolvió todo';
    const dias = (Date.now() - new Date(v.fecha).getTime()) / 86_400_000;
    return dias > DIAS_DEVOLUCION ? `Pasaron más de ${DIAS_DEVOLUCION} días desde la compra` : null;
  });
}
