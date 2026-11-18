import { Component, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { ProductoInventario } from '../../../cajera/inventario/inventario.datos';
import { InventarioService } from '../../../cajera/inventario/inventario.service';
import { Orden } from '../../../cajera/ordenes/ordenes.service';
import { Urgencia } from '../../../jefe/refacciones/refacciones.service';

export interface SolicitudNueva {
  orden: string;
  producto: ProductoInventario;
  cantidad: number;
  urgencia: Urgencia;
  nota: string;
}

/** T5.2 · Nueva solicitud de refacción: llega al jefe (J5.1) para aprobarla y entregarla. */
@Component({
  selector: 'app-nueva-solicitud',
  standalone: true,
  templateUrl: './nueva-solicitud.component.html',
  styleUrls: ['../../banco/modal-banco.css', './nueva-solicitud.component.css'],
})
export class NuevaSolicitudComponent {
  private readonly inventario = inject(InventarioService);

  readonly ordenes = input.required<Orden[]>();
  readonly cerrar = output<void>();
  readonly enviar = output<SolicitudNueva>();

  protected readonly orden = signal('');
  protected readonly texto = signal('');
  protected readonly elegido = signal<ProductoInventario | null>(null);
  protected readonly cantidad = signal(1);
  protected readonly urgencia = signal<Urgencia>('normal');
  protected readonly nota = signal('');
  protected readonly intentado = signal(false);

  protected readonly folio = computed(() => this.orden() || this.ordenes()[0]?.folio || '');

  protected readonly resultados = computed(() => {
    const q = this.texto().trim().toLowerCase();
    if (q.length < 2) return [];
    return this.inventario
      .productos()
      .filter((p) => p.categoria !== 'Accesorios' && (p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)))
      .slice(0, 4);
  });

  protected stock(p: ProductoInventario): number {
    return this.inventario.paraOrden(p.sku, this.folio());
  }

  protected elegir(p: ProductoInventario): void {
    this.elegido.set(p);
    this.texto.set(p.nombre);
  }

  protected escribir(valor: string): void {
    this.texto.set(valor);
    if (this.elegido() && valor !== this.elegido()!.nombre) this.elegido.set(null);
  }

  protected mandar(): void {
    this.intentado.set(true);
    const p = this.elegido();
    if (!p || !this.folio() || this.cantidad() < 1) return;
    this.enviar.emit({ orden: this.folio(), producto: p, cantidad: this.cantidad(), urgencia: this.urgencia(), nota: this.nota().trim() });
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}
