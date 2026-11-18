import { Component, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { formatearDinero } from '../../../compartido/formato';
import { ProductoInventario } from '../../../cajera/inventario/inventario.datos';
import { InventarioService, apartadas, margen } from '../../../cajera/inventario/inventario.service';

const dia = (iso: string) => `${new Date(iso).getDate()} ${new Date(iso).toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;

/** AD4.2 · Editar precio de venta, stock mínimo y proveedor principal. */
@Component({
  selector: 'app-editar-precio',
  standalone: true,
  templateUrl: './editar-precio.component.html',
  styleUrls: ['../../../tecnico/banco/modal-banco.css', './editar-precio.component.css'],
})
export class EditarPrecioComponent {
  private readonly inventario = inject(InventarioService);
  private readonly nombre = inject(AuthService).sesion()?.nombre ?? '';

  readonly producto = input.required<ProductoInventario>();
  readonly cerrar = output<void>();
  readonly guardado = output<string>();

  protected readonly precio = signal<number | null>(null);
  protected readonly minimo = signal<number | null>(null);
  protected readonly proveedor = signal('');
  protected readonly intentado = signal(false);

  protected readonly precioActual = computed(() => this.precio() ?? this.producto().precio);
  protected readonly minimoActual = computed(() => this.minimo() ?? this.producto().minimo);
  protected readonly proveedorActual = computed(() => this.proveedor() || this.producto().proveedor);
  protected readonly proveedores = computed(() => [...new Set(this.inventario.productos().map((p) => p.proveedor))].sort());

  protected readonly subtitulo = computed(() => {
    const p = this.producto();
    const ap = apartadas(p);
    return `${p.nombre} · ${p.categoria} · ${p.stock} en stock${ap ? ` (${ap} ${ap === 1 ? 'apartada' : 'apartadas'})` : ''}`;
  });

  protected readonly historial = computed(() => this.inventario.historialCosto(this.producto().sku).slice(0, 3).map((h) => ({ texto: `${dia(h.fecha)} · ${h.documento}`, costo: formatearDinero(h.costo) })));
  protected readonly ultimo = computed(() => {
    const h = this.inventario.historialCosto(this.producto().sku)[0];
    return h ? `${formatearDinero(h.costo)} · ${h.documento}` : 'Sin compras registradas';
  });

  protected readonly margen = computed(() => (this.precioActual() > 0 ? margen(this.producto().costo, this.precioActual()).porcentaje : 0));
  protected readonly invalido = computed(() => !(this.precioActual() > 0) || !(this.minimoActual() >= 0));

  protected readonly dinero = (n: number) => formatearDinero(n);

  protected guardar(): void {
    this.intentado.set(true);
    if (this.invalido()) return;
    const p = this.producto();
    this.inventario.cambiarPrecio(p.sku, { precio: this.precioActual(), minimo: this.minimoActual(), proveedor: this.proveedorActual() }, this.nombre);
    this.guardado.emit(`${p.sku} · ${p.nombre}: precio ${formatearDinero(this.precioActual())} (margen ${this.margen()}%).`);
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}
