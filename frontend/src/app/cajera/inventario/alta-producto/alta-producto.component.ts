import { Component, ElementRef, HostListener, OnInit, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { formatearDinero } from '../../../compartido/formato';
import { CATEGORIAS_INVENTARIO, PROVEEDORES, ProductoInventario, UNIDADES, redondear } from '../inventario.datos';
import { InventarioService, margen } from '../inventario.service';

const PREFIJOS: Record<string, string> = { Accesorios: 'ACC', Refacciones: 'REF', Consumibles: 'CON' };

/** C7.1 · Alta de producto (modal). También edita un producto del catálogo. */
@Component({
  selector: 'app-alta-producto',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './alta-producto.component.html',
  styleUrl: './alta-producto.component.css',
})
export class AltaProductoComponent implements OnInit {
  private readonly inventario = inject(InventarioService);
  private readonly campoSku = viewChild<ElementRef<HTMLInputElement>>('campoSku');

  /** null = alta; con producto = edición. */
  readonly producto = input<ProductoInventario | null>(null);
  readonly cerrar = output<void>();
  readonly guardado = output<{ texto: string; cerrar: boolean }>();

  protected readonly categorias = CATEGORIAS_INVENTARIO;
  protected readonly proveedores = PROVEEDORES;
  protected readonly unidades = UNIDADES;
  protected readonly dinero = formatearDinero;

  protected foto: string | null = null;
  protected sku = '';
  protected codigoBarras = '';
  protected nombre = '';
  protected categoria = CATEGORIAS_INVENTARIO[0];
  protected proveedor = PROVEEDORES[0];
  protected unidad = UNIDADES[0];
  protected readonly costo = signal<number | null>(null);
  protected readonly precio = signal<number | null>(null);
  protected stock: number | null = null;
  protected minimo: number | null = 5;
  protected ubicacion = '';

  protected readonly intentado = signal(false);
  protected readonly ultimo = signal<string | null>(null);

  protected readonly margen = computed(() => {
    const costo = this.costo();
    const precio = this.precio();
    return costo && precio ? margen(costo, precio) : null;
  });

  get edicion(): boolean {
    return this.producto() !== null;
  }

  ngOnInit(): void {
    const p = this.producto();
    if (!p) return;
    Object.assign(this, { foto: p.foto, sku: p.sku, codigoBarras: p.codigoBarras, nombre: p.nombre, categoria: p.categoria, proveedor: p.proveedor, unidad: p.unidad, stock: p.stock, minimo: p.minimo, ubicacion: p.ubicacion });
    this.costo.set(p.costo);
    this.precio.set(p.precio);
  }

  /** Siguiente SKU libre de la categoría (sugerencia en el campo). */
  protected get sugerenciaSku(): string {
    const prefijo = PREFIJOS[this.categoria] ?? 'PRD';
    const numeros = this.inventario
      .productos()
      .filter((p) => p.sku.startsWith(`${prefijo}-`))
      .map((p) => Number(p.sku.split('-').pop()))
      .filter((n) => !Number.isNaN(n));
    return `${prefijo}-${String(Math.max(0, ...numeros) + 1).padStart(3, '0')}`;
  }

  // ---------- Validación ----------
  protected get errores(): Record<string, string> {
    const e: Record<string, string> = {};
    const sku = this.sku.trim().toUpperCase();
    if (!sku) e['sku'] = 'Escribe el código o SKU';
    else if (sku !== this.producto()?.sku && this.inventario.buscar(sku)) e['sku'] = `Ya existe un producto con el SKU ${sku}`;
    const barras = this.codigoBarras.trim();
    const conBarras = barras && this.inventario.productos().find((p) => p.codigoBarras === barras && p.sku !== this.producto()?.sku);
    if (conBarras) e['barras'] = `Ya lo usa ${conBarras.sku}`;
    if (!this.nombre.trim()) e['nombre'] = 'Escribe el nombre del producto';
    if (!this.costo() || this.costo()! <= 0) e['costo'] = 'Escribe el costo';
    if (!this.precio() || this.precio()! <= 0) e['precio'] = 'Escribe el precio';
    else if (this.margen() && this.margen()!.importe < 0) e['precio'] = 'Queda por debajo del costo';
    if (!this.edicion && (this.stock === null || this.stock < 0 || !Number.isInteger(this.stock))) e['stock'] = 'Piezas enteras, 0 o más';
    if (this.minimo !== null && (this.minimo < 0 || !Number.isInteger(this.minimo))) e['minimo'] = 'Piezas enteras';
    return e;
  }

  protected error(campo: string): string | null {
    return this.intentado() ? (this.errores[campo] ?? null) : null;
  }

  // ---------- Foto ----------
  protected elegirFoto(evento: Event): void {
    const archivo = (evento.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => (this.foto = String(lector.result));
    lector.readAsDataURL(archivo);
  }

  // ---------- Guardar ----------
  protected guardar(otro: boolean): void {
    this.intentado.set(true);
    if (Object.keys(this.errores).length) return;
    const original = this.producto();
    const producto: ProductoInventario = {
      sku: this.sku.trim().toUpperCase(),
      codigoBarras: this.codigoBarras.trim(),
      nombre: this.nombre.trim(),
      categoria: this.categoria,
      proveedor: this.proveedor,
      unidad: this.unidad,
      costo: redondear(this.costo()!),
      precio: redondear(this.precio()!),
      stock: original ? original.stock : this.stock!,
      minimo: this.minimo ?? 0,
      ubicacion: this.ubicacion.trim(),
      apartados: original?.apartados ?? [],
      foto: this.foto,
      usoInterno: original?.usoInterno,
    };
    this.inventario.guardar(producto, original?.sku ?? null);
    const texto = original
      ? `Se guardaron los cambios de ${producto.sku} · ${producto.nombre}`
      : `${producto.sku} · ${producto.nombre} dado de alta con ${producto.stock} ${producto.stock === 1 ? 'pieza' : 'piezas'}`;
    this.guardado.emit({ texto, cerrar: !otro });
    if (otro) this.limpiar(texto);
  }

  /** "Guardar y agregar otro": conserva categoría, proveedor y unidad. */
  private limpiar(texto: string): void {
    Object.assign(this, { foto: null, sku: '', codigoBarras: '', nombre: '', stock: null, ubicacion: '' });
    this.costo.set(null);
    this.precio.set(null);
    this.intentado.set(false);
    this.ultimo.set(texto);
    this.campoSku()?.nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    this.cerrar.emit();
  }
}
