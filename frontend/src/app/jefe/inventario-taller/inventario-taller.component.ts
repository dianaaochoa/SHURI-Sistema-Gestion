import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { ProductoInventario } from '../../cajera/inventario/inventario.datos';
import { InventarioService, apartadas, disponible, estadoStock } from '../../cajera/inventario/inventario.service';
import { EntradaComponent } from '../../cajera/inventario/entrada/entrada.component';
import { PaginacionComponent, paginar } from '../../cajera/inventario/paginacion/paginacion.component';
import { formatearDinero } from '../../compartido/formato';
import { NuevoPedidoComponent } from '../refacciones/nuevo-pedido/nuevo-pedido.component';
import { VerProductoComponent } from './ver-producto/ver-producto.component';

/** Categorías que usa el taller (el resto del catálogo es mostrador). */
const DEL_TALLER = ['Refacciones', 'Consumibles'];

/** Marca a partir del nombre ("Batería iPhone 14" → Apple). */
export function marcaDe(p: ProductoInventario): string {
  const n = p.nombre.toLowerCase();
  if (n.includes('iphone')) return 'Apple';
  if (n.includes('samsung') || n.includes('galaxy')) return 'Samsung';
  if (n.includes('moto')) return 'Motorola';
  if (n.includes('huawei')) return 'Huawei';
  if (n.includes('xiaomi') || n.includes('redmi')) return 'Xiaomi';
  return 'Genérica';
}

type Estado = { texto: string; tono: string; accion: 'Ver pedido' | 'Pedir' | 'Ver' };

/** J6 · Inventario del taller: el mismo catálogo de caja filtrado en refacciones y consumibles, con costos. */
@Component({
  selector: 'app-inventario-taller',
  standalone: true,
  imports: [PaginacionComponent, EntradaComponent, NuevoPedidoComponent, VerProductoComponent],
  templateUrl: './inventario-taller.component.html',
  styleUrls: ['../lista-pagina.css', './inventario-taller.component.css'],
})
export class InventarioTallerComponent {
  protected readonly inventario = inject(InventarioService);
  private readonly router = inject(Router);

  /** ?vista=entrada muestra la entrada de mercancía (la misma de caja, C7.3). */
  protected readonly vista = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map((q) => q.get('vista'))), { initialValue: null });

  protected readonly dinero = formatearDinero;
  protected readonly categorias = DEL_TALLER;
  protected readonly busqueda = signal('');
  protected readonly categoria = signal('');
  protected readonly marca = signal('');
  protected readonly pagina = signal(1);
  protected readonly porPagina = signal(25);
  protected readonly aviso = signal<string | null>(null);

  protected readonly pidiendo = signal<ProductoInventario | null>(null);
  protected readonly pedidoNuevo = signal(false);
  protected readonly viendo = signal<ProductoInventario | null>(null);

  private readonly delTaller = computed(() => this.inventario.productos().filter((p) => DEL_TALLER.includes(p.categoria)));
  protected readonly marcas = computed(() => [...new Set(this.delTaller().map(marcaDe))].sort());

  private readonly enCamino = computed(() => new Set(this.inventario.pedidos().flatMap((p) => p.lineas.map((l) => l.sku))));

  protected readonly indicadores = computed(() => {
    const lista = this.delTaller();
    const sinStock = lista.filter((p) => p.stock === 0);
    const camino = sinStock.filter((p) => this.enCamino().has(p.sku)).length;
    return [
      { valor: lista.length, tono: '', titulo: 'Refacciones y consumibles', detalle: `De ${this.inventario.productos().length} productos del catálogo` },
      { valor: lista.filter((p) => p.stock > 0 && (estadoStock(p) === 'bajo' || disponible(p) === 0)).length, tono: 'advertencia', titulo: 'Stock bajo', detalle: 'Bajo el mínimo' },
      { valor: sinStock.length, tono: 'peligro', titulo: 'Sin stock', detalle: camino ? `${camino} ya en camino` : 'Ninguna pedida' },
      { valor: lista.reduce((s, p) => s + p.apartados.length, 0), tono: 'primario', titulo: 'Apartadas', detalle: 'Para órdenes aprobadas' },
    ];
  });

  protected readonly filtrados = computed(() => {
    const t = this.busqueda().trim().toLowerCase();
    return this.delTaller()
      .filter((p) => !t || `${p.nombre} ${p.sku} ${p.codigoBarras}`.toLowerCase().includes(t))
      .filter((p) => !this.categoria() || p.categoria === this.categoria())
      .filter((p) => !this.marca() || marcaDe(p) === this.marca())
      .map((p) => ({ producto: p, apartadas: apartadas(p), disponible: disponible(p), estado: this.estado(p), apartadoTexto: p.apartados.map((a) => `${a.cantidad} · ${a.folio}`).join(', ') }))
      // Lo que falta primero, como en Figma.
      .sort((a, b) => peso(a.estado) - peso(b.estado) || a.producto.sku.localeCompare(b.producto.sku));
  });

  protected readonly visibles = computed(() => paginar(this.filtrados(), this.pagina(), this.porPagina()));

  private estado(p: ProductoInventario): Estado {
    if (p.stock === 0) return this.enCamino().has(p.sku) ? { texto: 'En camino', tono: 'advertencia', accion: 'Ver pedido' } : { texto: 'Sin stock', tono: 'peligro', accion: 'Pedir' };
    if (disponible(p) === 0 || estadoStock(p) === 'bajo') return { texto: 'Stock bajo', tono: 'advertencia', accion: 'Pedir' };
    return { texto: 'OK', tono: 'exito', accion: 'Ver' };
  }

  protected filtrar(campo: 'busqueda' | 'categoria' | 'marca', valor: string): void {
    this[campo].set(valor);
    this.pagina.set(1);
  }

  protected accion(p: ProductoInventario, e: Estado): void {
    this.aviso.set(null);
    if (e.accion === 'Ver pedido') this.router.navigate(['/jefe/refacciones'], { queryParams: { vista: 'pedidos' } });
    else if (e.accion === 'Pedir') this.pidiendo.set(p);
    else this.viendo.set(p);
  }

  protected ir(vista: string | null): void {
    this.router.navigate([], { queryParams: { vista } });
  }

  protected terminado(mensaje: string): void {
    this.pidiendo.set(null);
    this.pedidoNuevo.set(false);
    this.aviso.set(mensaje);
  }

  protected entradaRegistrada(mensaje: string): void {
    this.ir(null);
    this.aviso.set(mensaje);
  }
}

const peso = (e: Estado) => ({ 'En camino': 0, 'Sin stock': 1, 'Stock bajo': 2, OK: 3 })[e.texto] ?? 3;
