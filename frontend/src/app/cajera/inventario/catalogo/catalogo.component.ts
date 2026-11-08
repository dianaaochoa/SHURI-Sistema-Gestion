import { Component, computed, inject, output, signal } from '@angular/core';
import { formatearDinero } from '../../../compartido/formato';
import { CATEGORIAS_INVENTARIO, PROVEEDORES, ProductoInventario } from '../inventario.datos';
import { EstadoStock, InventarioService, apartadas, disponible, estadoStock } from '../inventario.service';
import { descargarCsv } from '../csv';
import { PaginacionComponent, paginar } from '../paginacion/paginacion.component';

type Resumen = 'todos' | 'bajo' | 'agotado';

const TONO_STOCK: Record<EstadoStock, string> = { agotado: 'advertencia', bajo: 'peligro', justo: 'neutro', suficiente: 'exito' };

/** C7 · Catálogo de inventario: búsqueda, filtros, stock y paginación. */
@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [PaginacionComponent],
  templateUrl: './catalogo.component.html',
  styleUrl: './catalogo.component.css',
})
export class CatalogoComponent {
  private readonly inventario = inject(InventarioService);

  readonly editar = output<ProductoInventario>();
  readonly movimientos = output<string>();
  readonly importar = output<void>();
  readonly aviso = output<string>();

  protected readonly dinero = formatearDinero;
  protected readonly categorias = CATEGORIAS_INVENTARIO;
  protected readonly proveedores = PROVEEDORES;
  protected readonly stockBajo = this.inventario.stockBajo;
  protected readonly sinExistencias = this.inventario.sinExistencias;
  protected readonly disponible = disponible;

  // ---------- Filtros ----------
  protected readonly busqueda = signal('');
  protected readonly categoria = signal('');
  protected readonly proveedor = signal('');
  protected readonly resumen = signal<Resumen>('todos');
  protected readonly filtrosAbiertos = signal(false);
  protected readonly soloApartadas = signal(false);
  protected readonly soloUsoInterno = signal(false);
  protected readonly orden = signal<'asc' | 'desc' | null>(null);

  protected readonly filtrosExtra = computed(() => Number(this.soloApartadas()) + Number(this.soloUsoInterno()));

  protected readonly filtrados = computed(() => {
    const texto = this.busqueda().trim().toLowerCase();
    const lista = this.inventario.productos().filter((p) => {
      if (texto && !`${p.nombre} ${p.sku} ${p.codigoBarras}`.toLowerCase().includes(texto)) return false;
      if (this.categoria() && p.categoria !== this.categoria()) return false;
      if (this.proveedor() && p.proveedor !== this.proveedor()) return false;
      if (this.resumen() !== 'todos' && estadoStock(p) !== this.resumen()) return false;
      if (this.soloApartadas() && !p.apartados.length) return false;
      if (this.soloUsoInterno() && !p.usoInterno) return false;
      return true;
    });
    const orden = this.orden();
    return orden ? [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') * (orden === 'asc' ? 1 : -1)) : lista;
  });

  protected cambiar<T>(filtro: (valor: T) => void, valor: T): void {
    filtro(valor);
    this.pagina.set(1);
  }

  protected elegirResumen(valor: Resumen): void {
    this.resumen.set(valor);
    this.pagina.set(1);
  }

  protected limpiarFiltros(): void {
    this.soloApartadas.set(false);
    this.soloUsoInterno.set(false);
    this.filtrosAbiertos.set(false);
  }

  protected ordenar(): void {
    this.orden.update((o) => (o === null ? 'asc' : o === 'asc' ? 'desc' : null));
  }

  // ---------- Paginación ----------
  protected readonly porPagina = signal(50);
  protected readonly pagina = signal(1);
  protected readonly visibles = computed(() => paginar(this.filtrados(), this.pagina(), this.porPagina()));

  // ---------- Selección y Excel ----------
  protected readonly seleccion = signal<string[]>([]);
  protected readonly todosElegidos = computed(() => this.visibles().length > 0 && this.visibles().every((p) => this.seleccion().includes(p.sku)));

  protected alternar(sku: string): void {
    this.seleccion.update((s) => (s.includes(sku) ? s.filter((x) => x !== sku) : [...s, sku]));
  }

  protected alternarTodos(marcar: boolean): void {
    const skus = this.visibles().map((p) => p.sku);
    this.seleccion.update((s) => (marcar ? [...new Set([...s, ...skus])] : s.filter((x) => !skus.includes(x))));
  }

  /** Exporta lo seleccionado o, si no hay selección, todo lo filtrado. */
  protected exportar(): void {
    const elegidos = this.seleccion();
    const lista = elegidos.length ? this.inventario.productos().filter((p) => elegidos.includes(p.sku)) : this.filtrados();
    descargarCsv(`inventario_${new Date().toISOString().slice(0, 10)}.csv`, [
      ['SKU', 'Código de barras', 'Nombre', 'Categoría', 'Proveedor', 'Unidad', 'Costo', 'Precio', 'Stock', 'Apartadas', 'Disponible', 'Mínimo', 'Ubicación'],
      ...lista.map((p) => [p.sku, p.codigoBarras, p.nombre, p.categoria, p.proveedor, p.unidad, p.costo, p.precio, p.stock, apartadas(p), disponible(p), p.minimo, p.ubicacion]),
    ]);
    this.aviso.emit(`Se exportaron ${lista.length} ${lista.length === 1 ? 'producto' : 'productos'} a Excel`);
  }

  // ---------- Celdas ----------
  protected tono(p: ProductoInventario): string {
    return TONO_STOCK[estadoStock(p)];
  }

  protected textoApartadas(p: ProductoInventario): string {
    return p.apartados.length ? `${apartadas(p)} · ${p.apartados.map((a) => a.folio).join(', ')}` : '';
  }
}
