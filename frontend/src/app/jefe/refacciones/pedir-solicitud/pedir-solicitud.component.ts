import { Component, computed, inject, input, output, signal } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { FormaPago, LineaPedido, PROVEEDORES } from '../../../cajera/inventario/inventario.datos';
import { InventarioService } from '../../../cajera/inventario/inventario.service';
import { OrdenesService } from '../../../cajera/ordenes/ordenes.service';
import { formatearDinero } from '../../../compartido/formato';
import { diaMes } from '../../por-cotizar/existencia';
import { PAGOS_PEDIDO, RECIBE, desdeInput, fechaInput } from '../pedido';
import { RefaccionesService, Solicitud } from '../refacciones.service';

/** J5.2 · Pedido a proveedor de la pieza que pidió un técnico. */
@Component({
  selector: 'app-pedir-solicitud',
  standalone: true,
  templateUrl: './pedir-solicitud.component.html',
  styleUrl: './pedir-solicitud.component.css',
})
export class PedirSolicitudComponent {
  private readonly inventario = inject(InventarioService);
  private readonly refacciones = inject(RefaccionesService);
  private readonly ordenes = inject(OrdenesService);
  private readonly jefe = inject(AuthService).sesion()?.nombre ?? '';

  readonly solicitud = input.required<Solicitud>();
  readonly cerrar = output<void>();
  readonly registrado = output<string>();

  protected readonly proveedores = PROVEEDORES;
  protected readonly pagos = PAGOS_PEDIDO;
  protected readonly recibeOpciones = RECIBE;
  protected readonly folio = this.inventario.siguientePedido();

  protected readonly producto = computed(() => this.inventario.buscar(this.solicitud().sku) ?? null);
  /** Una pieza más para que el stock no quede en cero (si el producto tiene mínimo). */
  protected readonly extraSugerido = computed(() => (this.producto()?.minimo ? Math.max(1, this.producto()!.minimo - this.producto()!.stock) : 0));

  protected readonly proveedor = signal<string | null>(null);
  protected readonly proveedorElegido = computed(() => this.proveedor() ?? this.producto()?.proveedor ?? PROVEEDORES[0]);
  protected readonly extra = signal(true);
  protected readonly cantidad = signal<number | null>(null);
  protected readonly cantidadElegida = computed(() => this.cantidad() ?? this.solicitud().cantidad + (this.extra() ? this.extraSugerido() : 0));
  protected readonly costo = signal<number | null>(null);
  protected readonly costoElegido = computed(() => this.costo() ?? this.producto()?.costo ?? 0);
  protected readonly llega = signal(fechaInput(1));
  protected readonly avisar = signal(true);
  protected readonly pago = signal<FormaPago>('efectivo');
  protected readonly recibe = signal(RECIBE[0]);
  protected readonly nota = signal('');

  protected readonly subtitulo = computed(() => `${this.solicitud().nombre} · para orden ${this.solicitud().orden}`);

  /** La re-cotización todavía no está aprobada (J3.4): se avisa antes de pedir. */
  protected readonly sinAprobar = computed(() => {
    const o = this.ordenes.ordenes().find((x) => x.folio === this.solicitud().orden);
    return this.solicitud().siAprueba && (!!o?.danoAdicional || o?.estado === 'adicional') ? o : null;
  });

  protected readonly consecuencia = computed(
    () =>
      `Caja verá ${this.folio} en “Pedidos por recibir”. Al registrar la entrada, la pieza se aparta sola para ${this.solicitud().orden} y la orden muestra “Esperando refacción · llega ${diaMes(desdeInput(this.llega()))}”.`,
  );

  protected readonly valido = computed(() => this.cantidadElegida() >= this.solicitud().cantidad && this.costoElegido() > 0 && !!this.llega());

  protected alternarExtra(valor: boolean): void {
    this.extra.set(valor);
    this.cantidad.set(null);
  }

  protected registrar(): void {
    if (!this.valido()) return;
    const s = this.solicitud();
    const lineas: LineaPedido[] = [{ sku: s.sku, cantidad: s.cantidad, costo: this.costoElegido(), orden: s.orden }];
    const sobra = this.cantidadElegida() - s.cantidad;
    if (sobra > 0) lineas.push({ sku: s.sku, cantidad: sobra, costo: this.costoElegido() });
    const llega = desdeInput(this.llega());
    const pedido = this.inventario.registrarPedido({ proveedor: this.proveedorElegido(), lineas, pago: this.pago(), llega, jefe: this.jefe, recibe: this.recibe(), nota: this.nota().trim() || undefined });
    this.refacciones.pedida(s.id, pedido.folio, diaMes(llega), this.jefe);
    const total = formatearDinero(this.cantidadElegida() * this.costoElegido());
    this.registrado.emit(`${pedido.folio} registrado con ${this.proveedorElegido()} por ${total} · llega ${diaMes(llega)}${this.avisar() ? ` · se avisará a ${s.tecnico.split(' ')[0]}` : ''}`);
  }
}
