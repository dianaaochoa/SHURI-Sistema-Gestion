import { Component, computed, inject, signal } from '@angular/core';
import { formatearDinero } from '../../compartido/formato';
import { ProductoInventario } from '../../cajera/inventario/inventario.datos';
import { AltaProductoComponent } from '../../cajera/inventario/alta-producto/alta-producto.component';
import { InventarioService, disponible, margen } from '../../cajera/inventario/inventario.service';
import { AjustarPreciosComponent } from './ajustar-precios/ajustar-precios.component';
import { EditarPrecioComponent } from './editar-precio/editar-precio.component';

type FiltroMargen = '' | 'bajo' | 'medio' | 'alto';

/** Margen bajo: por debajo de esto se avisa (Figma AD4.1 "Menos de 35%"). */
export const MARGEN_BAJO = 35;
const POR_PAGINA = 9;
const DIA = 86_400_000;

/** Pastilla de margen: verde desde 50 %, ámbar de 35 a 49 % y rojo debajo de 35 %. */
export const tonoMargen = (m: number) => (m >= 50 ? 'exito' : m >= MARGEN_BAJO ? 'advertencia' : 'peligro');

/** AD4.1 · Catálogo y precios (AD4.2 editar precio, AD4.3 ajustar en grupo; "Añadir producto" es el alta de Inventario, C7.1). */
@Component({
  selector: 'app-catalogo-admin',
  standalone: true,
  imports: [EditarPrecioComponent, AjustarPreciosComponent, AltaProductoComponent],
  templateUrl: './catalogo-admin.component.html',
  styleUrls: ['../reportes.css', './catalogo-admin.component.css'],
})
export class CatalogoAdminComponent {
  protected readonly inventario = inject(InventarioService);

  protected readonly busqueda = signal('');
  protected readonly categoria = signal('');
  protected readonly filtroMargen = signal<FiltroMargen>('');
  protected readonly pagina = signal(0);
  protected readonly editando = signal<ProductoInventario | null>(null);
  protected readonly ajustando = signal(false);
  protected readonly agregando = signal(false);
  protected readonly aviso = signal('');

  /** Lo que se vende (lo de uso interno del taller no tiene precio al público). */
  private readonly productos = computed(() => this.inventario.productos().filter((p) => !p.usoInterno));
  protected readonly categorias = computed(() => [...new Set(this.productos().map((p) => p.categoria))].sort());

  protected readonly indicadores = computed(() => {
    const lista = this.productos();
    const margenes = lista.map((p) => margen(p.costo, p.precio).porcentaje);
    const promedio = margenes.length ? Math.round(margenes.reduce((s, m) => s + m, 0) / margenes.length) : 0;
    const desde = Date.now() - 30 * DIA;
    const subio = lista.filter((p) => {
      const ultima = this.inventario.historialCosto(p.sku)[0];
      return ultima && new Date(ultima.fecha).getTime() >= desde && ultima.costo > p.costo;
    }).length;
    return [
      { valor: formatearDinero(lista.reduce((s, p) => s + p.stock * p.costo, 0), true), tono: '', titulo: 'Inventario a costo', detalle: `${lista.length} productos` },
      { valor: `${promedio}%`, tono: 'exito', titulo: 'Margen promedio', detalle: 'Precio venta vs costo' },
      { valor: `${margenes.filter((m) => m < MARGEN_BAJO).length}`, tono: 'peligro', titulo: 'Margen bajo', detalle: `Menos de ${MARGEN_BAJO}%` },
      { valor: `${subio}`, tono: 'advertencia', titulo: 'Costo subió', detalle: 'En los últimos 30 días' },
    ];
  });

  private readonly filtrados = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    return this.productos().filter((p) => {
      const m = margen(p.costo, p.precio).porcentaje;
      const pasaMargen = !this.filtroMargen() || (this.filtroMargen() === 'bajo' ? m < MARGEN_BAJO : this.filtroMargen() === 'medio' ? m >= MARGEN_BAJO && m < 50 : m >= 50);
      return (!this.categoria() || p.categoria === this.categoria()) && pasaMargen && (!q || [p.nombre, p.sku, p.codigoBarras].some((t) => t.toLowerCase().includes(q)));
    });
  });

  protected readonly total = computed(() => this.filtrados().length);
  protected readonly paginas = computed(() => Math.max(1, Math.ceil(this.total() / POR_PAGINA)));
  protected readonly numeros = computed(() => Array.from({ length: this.paginas() }, (_, i) => i));
  protected readonly desde = computed(() => (this.total() ? this.pagina() * POR_PAGINA + 1 : 0));

  protected readonly filas = computed(() =>
    this.filtrados()
      .slice(this.pagina() * POR_PAGINA, (this.pagina() + 1) * POR_PAGINA)
      .map((p) => {
        const m = margen(p.costo, p.precio).porcentaje;
        return { p, disponible: disponible(p), margen: m, tono: tonoMargen(m) };
      }),
  );

  protected dinero(n: number): string {
    return formatearDinero(n);
  }

  /** Cualquier cambio de filtro regresa a la primera página. */
  protected filtrar(cual: 'busqueda' | 'categoria' | 'margen', valor: string): void {
    if (cual === 'busqueda') this.busqueda.set(valor);
    else if (cual === 'categoria') this.categoria.set(valor);
    else this.filtroMargen.set(valor as FiltroMargen);
    this.pagina.set(0);
  }

  protected guardado(texto: string): void {
    this.editando.set(null);
    this.ajustando.set(false);
    this.aviso.set(texto);
  }
}
