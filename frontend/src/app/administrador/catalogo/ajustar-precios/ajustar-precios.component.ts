import { Component, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { formatearDinero } from '../../../compartido/formato';
import { InventarioService, margen } from '../../../cajera/inventario/inventario.service';
import { IVA } from '../../../cajera/inventario/inventario.datos';

type Modo = 'porcentaje' | 'margen' | 'redondear';
type Redondeo = 'ninguno' | 'cero' | 'nueve';

const MODOS: { id: Modo; texto: string; detalle: string }[] = [
  { id: 'porcentaje', texto: 'Subir o bajar un porcentaje', detalle: 'Por ejemplo +5% por inflación' },
  { id: 'margen', texto: 'Fijar un margen sobre el costo', detalle: 'El precio se calcula para dejar ese margen' },
  { id: 'redondear', texto: 'Redondear precios', detalle: 'A $9 o $0 al final' },
];

/** Redondea al peso que termina en 0 o en 9 (Figma AD4.3 "Terminar en $0"). */
function redondearPrecio(precio: number, r: Redondeo): number {
  if (r === 'cero') return Math.round(precio / 10) * 10 || 10;
  if (r === 'nueve') return Math.max(9, Math.round((precio + 1) / 10) * 10 - 1);
  return Math.round(precio * 100) / 100;
}

/** AD4.3 · Ajustar precios en grupo (por categoría y proveedor), con vista previa. */
@Component({
  selector: 'app-ajustar-precios',
  standalone: true,
  templateUrl: './ajustar-precios.component.html',
  styleUrls: ['../../../tecnico/banco/modal-banco.css', './ajustar-precios.component.css'],
})
export class AjustarPreciosComponent {
  private readonly inventario = inject(InventarioService);
  private readonly nombre = inject(AuthService).sesion()?.nombre ?? '';

  readonly categorias = input<string[]>([]);
  readonly cerrar = output<void>();
  readonly aplicado = output<string>();

  protected readonly modos = MODOS;
  protected readonly categoria = signal('');
  protected readonly proveedor = signal('');
  protected readonly modo = signal<Modo>('porcentaje');
  protected readonly valor = signal(5);
  protected readonly redondeo = signal<Redondeo>('cero');

  protected readonly proveedores = computed(() => [...new Set(this.inventario.productos().map((p) => p.proveedor))].sort());

  /** Productos que cambian y su precio nuevo. */
  protected readonly cambios = computed(() => {
    const v = this.valor() || 0;
    return this.inventario
      .productos()
      .filter((p) => !p.usoInterno && (!this.categoria() || p.categoria === this.categoria()) && (!this.proveedor() || p.proveedor === this.proveedor()))
      .map((p) => {
        let nuevo = p.precio;
        if (this.modo() === 'porcentaje') nuevo = p.precio * (1 + v / 100);
        // Margen sobre el precio sin IVA: precio = costo / (1 − margen) × 1.16.
        if (this.modo() === 'margen' && v < 100) nuevo = (p.costo / (1 - v / 100)) * (1 + IVA);
        nuevo = redondearPrecio(nuevo, this.modo() === 'redondear' && this.redondeo() === 'ninguno' ? 'cero' : this.redondeo());
        return { p, nuevo, margen: margen(p.costo, nuevo).porcentaje };
      })
      .filter((c) => c.nuevo !== p0(c.p.precio));
  });

  protected readonly invalido = computed(() => this.modo() !== 'redondear' && (this.valor() === null || Number.isNaN(this.valor()) || (this.modo() === 'margen' && (this.valor() <= 0 || this.valor() >= 100))));

  protected readonly dinero = (n: number) => formatearDinero(n);

  protected aplicar(): void {
    if (this.invalido() || !this.cambios().length) return;
    const motivo = this.modo() === 'porcentaje' ? `Ajuste de ${this.valor() > 0 ? '+' : ''}${this.valor()}%` : this.modo() === 'margen' ? `Margen fijo de ${this.valor()}%` : 'Redondeo de precios';
    const n = this.cambios().length;
    this.inventario.ajustarPrecios(
      this.cambios().map((c) => ({ sku: c.p.sku, precio: c.nuevo })),
      motivo,
      this.nombre,
    );
    this.aplicado.emit(`${motivo}: ${n} ${n === 1 ? 'producto actualizado' : 'productos actualizados'}.`);
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}

/** Precio a centavos (para comparar sin errores de punto flotante). */
const p0 = (n: number) => Math.round(n * 100) / 100;
