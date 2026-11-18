import { Component, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { ProductoInventario } from '../../../cajera/inventario/inventario.datos';
import { InventarioService } from '../../../cajera/inventario/inventario.service';
import { Concepto, Orden } from '../../../cajera/ordenes/ordenes.service';
import { ConfiguracionTallerService } from '../../../jefe/configuracion/configuracion.service';
import { BuscarPiezaComponent } from '../buscar-pieza/buscar-pieza.component';
import { OrdenesService } from '../../../cajera/ordenes/ordenes.service';
import { AuthService } from '../../../acceso/auth.service';
import { FotosOrdenComponent, fotosSinGuardar } from '../../../compartido/fotos-orden/fotos-orden.component';

const CUANDO = ['Durante la reparación', 'Al abrir el equipo', 'En las pruebas finales'];

/** T3.5 · Daño adicional (o no cubierto por la garantía): el jefe lo re-cotiza (J3.4) y el cliente decide. */
@Component({
  selector: 'app-dano-adicional',
  standalone: true,
  imports: [BuscarPiezaComponent, FotosOrdenComponent],
  templateUrl: './dano-adicional.component.html',
  styleUrls: ['../modal-banco.css', './dano-adicional.component.css'],
})
export class DanoAdicionalComponent {
  private readonly inventario = inject(InventarioService);
  private readonly configuracion = inject(ConfiguracionTallerService);

  readonly orden = input.required<Orden>();
  private readonly fotosServicio = inject(OrdenesService);
  private readonly nombreFotos = inject(AuthService).sesion()?.nombre ?? '';
  readonly cerrar = output<void>();
  readonly enviar = output<{ texto: string; urgente: boolean; conceptos: Concepto[] }>();

  protected readonly cuando = CUANDO;
  protected readonly texto = signal('');
  protected readonly momento = signal(CUANDO[0]);
  protected readonly urgente = signal(false);
  protected readonly piezas = signal<ProductoInventario[]>([]);
  /** Fotos de adicional: se guardan en la orden al confirmar. */
  protected readonly fotos = signal<{ url: string; nombre: string }[]>([]);
  protected readonly fotosVista = computed(() => fotosSinGuardar(this.fotos(), this.nombreFotos));
  protected quitarFoto(id: string): void {
    this.fotos.update((l) => l.filter((_, i) => String(i) !== id));
  }
  protected readonly intentado = signal(false);

  protected readonly garantia = computed(() => this.orden().estado === 'en-garantia');
  protected readonly manoObra = computed(() => this.configuracion.niveles().find((n) => n.id === 'adicional')?.precio ?? 0);

  protected stock(p: ProductoInventario): string {
    const n = this.inventario.paraOrden(p.sku, this.orden().folio);
    return n > 0 ? `1 pza · ${n} en stock` : '1 pza · sin stock, pedir';
  }

  protected agregar(p: ProductoInventario): void {
    this.piezas.update((l) => (l.some((x) => x.sku === p.sku) ? l : [...l, p]));
  }

  protected quitar(sku: string): void {
    this.piezas.update((l) => l.filter((x) => x.sku !== sku));
  }

  protected mandar(): void {
    this.intentado.set(true);
    if (!this.texto().trim() || !this.fotos().length) return;
    const conceptos: Concepto[] = [
      ...this.piezas().map((p) => ({ tipo: 'refaccion' as const, descripcion: p.nombre, sku: p.sku, cantidad: 1, costo: p.costo, precio: p.precio })),
      { tipo: 'mano-obra', descripcion: 'Mano de obra adicional', cantidad: 1, costo: 0, precio: this.manoObra(), detalle: '30 min · nivel bajo' },
    ];
    this.fotosServicio.agregarEvidencias(this.orden().folio, 'adicional', this.fotos(), this.nombreFotos);
    this.enviar.emit({ texto: `${this.texto().trim()} (${this.momento().toLowerCase()})`, urgente: this.urgente(), conceptos });
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}
