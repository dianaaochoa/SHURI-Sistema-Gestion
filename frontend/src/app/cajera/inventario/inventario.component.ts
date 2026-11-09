import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { AjusteInventarioComponent } from './ajuste-inventario/ajuste-inventario.component';
import { AjustesComponent } from './ajustes/ajustes.component';
import { AltaProductoComponent } from './alta-producto/alta-producto.component';
import { CatalogoComponent } from './catalogo/catalogo.component';
import { EntradaComponent } from './entrada/entrada.component';
import { HistorialEntradasComponent, mesesDe } from './historial-entradas/historial-entradas.component';
import { ImportarExcelComponent } from './importar-excel/importar-excel.component';
import { ProductoInventario } from './inventario.datos';
import { InventarioService } from './inventario.service';
import { MovimientosComponent } from './movimientos/movimientos.component';

export type Vista = 'catalogo' | 'entradas' | 'historial' | 'ajustes';

const PESTANAS: { vista: Vista; texto: string }[] = [
  { vista: 'catalogo', texto: 'Catálogo' },
  { vista: 'entradas', texto: 'Entradas de mercancía' },
  { vista: 'ajustes', texto: 'Ajustes de inventario' },
];

/** C7 · Inventario: catálogo (C7.1, C7.2), entradas (C7.3, C7.5–C7.7) y ajustes (C7.4). */
@Component({
  selector: 'app-inventario',
  standalone: true,
  imports: [CatalogoComponent, EntradaComponent, HistorialEntradasComponent, AjustesComponent, AltaProductoComponent, ImportarExcelComponent, AjusteInventarioComponent, MovimientosComponent],
  templateUrl: './inventario.component.html',
  styleUrl: './inventario.component.css',
})
export class InventarioComponent {
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  protected readonly inventario = inject(InventarioService);
  protected readonly pestanas = PESTANAS;

  /** La pestaña va en la URL (?vista=entradas) para poder enlazarla desde Inicio. */
  protected readonly vista = toSignal(this.ruta.queryParamMap.pipe(map((q) => (q.get('vista') as Vista) || 'catalogo')), { initialValue: 'catalogo' as Vista });
  protected readonly pestanaActiva = computed(() => (this.vista() === 'historial' ? 'entradas' : this.vista()));

  protected readonly meses = computed(() => mesesDe(this.inventario.entradas()));
  protected readonly mes = signal<string | null>(null);
  protected readonly mesElegido = computed(() => this.mes() ?? this.meses()[0]?.clave ?? '');

  protected readonly aviso = signal<string | null>(null);

  // Modales
  protected readonly alta = signal<{ producto: ProductoInventario | null } | null>(null);
  protected readonly importar = signal(false);
  protected readonly ajuste = signal<{ sku: string | null } | null>(null);
  protected readonly movimientos = signal<string | null>(null);

  ir(vista: Vista): void {
    this.aviso.set(null);
    this.router.navigate([], { queryParams: { vista: vista === 'catalogo' ? null : vista }, replaceUrl: true });
  }

  protected avisar(texto: string): void {
    this.aviso.set(texto);
  }

  protected guardado(texto: string, cerrar: boolean): void {
    this.aviso.set(texto);
    if (cerrar) this.alta.set(null);
  }

  protected ajustar(sku: string | null): void {
    this.movimientos.set(null);
    this.ajuste.set({ sku });
  }

  protected ajusteAplicado(texto: string): void {
    this.ajuste.set(null);
    this.aviso.set(texto);
  }
}
