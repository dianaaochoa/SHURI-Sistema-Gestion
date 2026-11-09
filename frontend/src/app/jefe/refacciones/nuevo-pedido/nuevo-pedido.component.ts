import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { FormaPago, PROVEEDORES, ProductoInventario } from '../../../cajera/inventario/inventario.datos';
import { InventarioService } from '../../../cajera/inventario/inventario.service';
import { OrdenesService } from '../../../cajera/ordenes/ordenes.service';
import { formatearDinero } from '../../../compartido/formato';
import { diaMes } from '../../por-cotizar/existencia';
import { PAGOS_PEDIDO, RECIBE, desdeInput, fechaInput } from '../pedido';
import { RefaccionesService } from '../refacciones.service';

interface Linea {
  sku: string;
  nombre: string;
  /** '' = para stock */
  orden: string;
  cantidad: number;
  costo: number;
}

/** Órdenes que pueden recibir una pieza: las que siguen en el taller. */
const EN_TALLER = ['por-cotizar', 'por-aprobar', 'adicional', 'en-taller', 'esperando-refaccion', 'en-garantia'];

/** J5.5 · Nuevo pedido a proveedor: para surtir stock o varias órdenes a la vez. */
@Component({
  selector: 'app-nuevo-pedido',
  standalone: true,
  templateUrl: './nuevo-pedido.component.html',
  styleUrl: './nuevo-pedido.component.css',
})
export class NuevoPedidoComponent implements OnInit {
  private readonly inventario = inject(InventarioService);
  private readonly refacciones = inject(RefaccionesService);
  private readonly todas = inject(OrdenesService).ordenes;
  private readonly jefe = inject(AuthService).sesion()?.nombre ?? '';

  /** J6 "Pedir": el producto llega ya agregado y con su proveedor. */
  readonly inicial = input<ProductoInventario | null>(null);
  readonly cerrar = output<void>();
  readonly registrado = output<string>();

  protected readonly dinero = formatearDinero;
  protected readonly proveedores = PROVEEDORES;
  protected readonly pagos = PAGOS_PEDIDO;
  protected readonly recibeOpciones = RECIBE;
  protected readonly folio = this.inventario.siguientePedido();
  protected readonly ordenes = computed(() =>
    this.todas()
      .filter((o) => EN_TALLER.includes(o.estado))
      .map((o) => o.folio)
      .sort(),
  );

  protected readonly proveedor = signal(PROVEEDORES[0]);
  protected readonly llega = signal(fechaInput(2));
  protected readonly pago = signal<FormaPago>('credito');
  protected readonly recibe = signal(RECIBE[0]);
  protected readonly lineas = signal<Linea[]>([]);

  protected readonly busqueda = signal('');
  protected readonly resultados = computed(() => {
    const t = this.busqueda().trim().toLowerCase();
    if (!t) return [];
    return this.inventario
      .productos()
      .filter((p) => `${p.nombre} ${p.sku}`.toLowerCase().includes(t))
      .sort((a, b) => Number(b.proveedor === this.proveedor()) - Number(a.proveedor === this.proveedor()))
      .slice(0, 6);
  });

  ngOnInit(): void {
    const p = this.inicial();
    if (!p) return;
    this.proveedor.set(p.proveedor);
    this.agregar(p);
  }

  protected readonly total = computed(() => this.lineas().reduce((s, l) => s + l.cantidad * l.costo, 0));

  protected agregar(p: ProductoInventario): void {
    this.busqueda.set('');
    if (this.lineas().some((l) => l.sku === p.sku && !l.orden)) {
      this.lineas.update((lista) => lista.map((l) => (l.sku === p.sku && !l.orden ? { ...l, cantidad: l.cantidad + 1 } : l)));
      return;
    }
    this.lineas.update((lista) => [...lista, { sku: p.sku, nombre: p.nombre, orden: '', cantidad: Math.max(1, p.minimo * 2 - p.stock), costo: p.costo }]);
  }

  protected cambiar(i: number, campo: 'orden' | 'cantidad' | 'costo', valor: string): void {
    this.lineas.update((lista) =>
      lista.map((l, j) => (j !== i ? l : { ...l, [campo]: campo === 'orden' ? valor : Math.max(campo === 'cantidad' ? 1 : 0, Number(valor) || 0) })),
    );
  }

  protected quitar(i: number): void {
    this.lineas.update((lista) => lista.filter((_, j) => j !== i));
  }

  protected registrar(): void {
    if (!this.lineas().length) return;
    const llega = desdeInput(this.llega());
    const pedido = this.inventario.registrarPedido({
      proveedor: this.proveedor(),
      lineas: this.lineas().map((l) => ({ sku: l.sku, cantidad: l.cantidad, costo: l.costo, orden: l.orden || undefined })),
      pago: this.pago(),
      llega,
      jefe: this.jefe,
      recibe: this.recibe(),
    });
    this.refacciones.registrarPedido(pedido.folio, `${this.lineas().length} ${this.lineas().length === 1 ? 'pieza' : 'piezas'} a ${this.proveedor()} por ${formatearDinero(this.total())}`, this.jefe);
    this.registrado.emit(`${pedido.folio} registrado con ${this.proveedor()} por ${formatearDinero(this.total())} · llega ${diaMes(llega)} · caja lo verá en “Pedidos por recibir”`);
  }
}
