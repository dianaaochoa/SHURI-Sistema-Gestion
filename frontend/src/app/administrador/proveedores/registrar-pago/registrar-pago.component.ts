import { Component, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { CajaService } from '../../../cajera/caja.service';
import { formatearDinero } from '../../../compartido/formato';
import { Factura, OrigenPago, ProveedoresService } from '../../proveedores.service';

const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** AD5.2 · Registrar pago a una factura a crédito del proveedor. */
@Component({
  selector: 'app-registrar-pago',
  standalone: true,
  templateUrl: './registrar-pago.component.html',
  styleUrls: ['../../../tecnico/banco/modal-banco.css'],
})
export class RegistrarPagoComponent {
  private readonly servicio = inject(ProveedoresService);
  private readonly nombre = inject(AuthService).sesion()?.nombre ?? '';
  protected readonly cajaAbierta = inject(CajaService).abierta;

  readonly factura = input.required<Factura>();
  readonly cerrar = output<void>();
  readonly pagado = output<string>();

  protected readonly monto = signal<number | null>(null);
  protected readonly fecha = signal(hoyIso());
  protected readonly origen = signal<OrigenPago>('transferencia');
  protected readonly referencia = signal('');
  protected readonly intentado = signal(false);
  protected readonly hoy = hoyIso();

  protected readonly montoActual = computed(() => this.monto() ?? this.factura().saldo);
  protected readonly subtitulo = computed(() => {
    const f = this.factura();
    const vence = `${f.vence.getDate()} ${f.vence.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;
    return `${f.entrada.documento} · saldo ${formatearDinero(f.saldo)} · vence ${vence}`;
  });
  protected readonly error = computed(() => {
    const m = this.montoActual();
    if (!(m > 0)) return 'Escribe un monto mayor a cero.';
    if (m > this.factura().saldo + 0.005) return `El monto no puede pasar del saldo (${formatearDinero(this.factura().saldo)}).`;
    if (!this.fecha() || this.fecha() > this.hoy) return 'La fecha no puede ser futura.';
    if (this.origen() === 'caja' && !this.cajaAbierta()) return 'No hay un turno de caja abierto para sacar el efectivo.';
    return '';
  });

  protected registrar(): void {
    this.intentado.set(true);
    if (this.error()) return;
    const f = this.factura();
    const monto = this.montoActual();
    const [a, m, d] = this.fecha().split('-').map(Number);
    const fecha = this.fecha() === this.hoy ? undefined : new Date(a, m - 1, d, 12).toISOString();
    this.servicio.pagar({ proveedor: f.entrada.proveedor, documento: f.entrada.documento, monto, origen: this.origen(), referencia: this.referencia().trim(), por: this.nombre, fecha });
    const resta = f.saldo - monto;
    this.pagado.emit(
      `Pago de ${formatearDinero(monto)} a ${f.entrada.documento} registrado${this.origen() === 'caja' ? ' (sale de caja y entra al corte)' : ''}. ${resta > 0.005 ? `Quedan ${formatearDinero(resta)} por pagar.` : 'La factura quedó pagada.'}`,
    );
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}
