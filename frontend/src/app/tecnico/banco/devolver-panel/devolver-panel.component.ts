import { Component, computed, inject, input, output, signal } from '@angular/core';
import { InventarioService } from '../../../cajera/inventario/inventario.service';
import { Orden } from '../../../cajera/ordenes/ordenes.service';
import { FichaEquipoComponent } from '../ficha-equipo/ficha-equipo.component';
import { OrdenesService } from '../../../cajera/ordenes/ordenes.service';
import { AuthService } from '../../../acceso/auth.service';
import { FotosOrdenComponent, fotosSinGuardar } from '../../../compartido/fotos-orden/fotos-orden.component';

const REVISION = ['Equipo armado y con todos sus tornillos', 'Enciende igual que al recibirlo', 'Sin piezas ni etiquetas del taller'];

/** T3.9 · Presupuesto rechazado: el técnico arma el equipo como llegó y lo devuelve a caja. */
@Component({
  selector: 'app-devolver-panel',
  standalone: true,
  imports: [FichaEquipoComponent, FotosOrdenComponent],
  templateUrl: './devolver-panel.component.html',
  styleUrls: ['../banco-comun.css', './devolver-panel.component.css'],
})
export class DevolverPanelComponent {
  private readonly inventario = inject(InventarioService);

  readonly orden = input.required<Orden>();
  private readonly fotosServicio = inject(OrdenesService);
  private readonly nombreFotos = inject(AuthService).sesion()?.nombre ?? '';
  readonly devolver = output<string>();

  protected readonly revision = REVISION;
  protected readonly hechos = signal<boolean[]>(REVISION.map(() => false));
  /** Fotos de devolucion: se guardan en la orden al confirmar. */
  protected readonly fotos = signal<{ url: string; nombre: string }[]>([]);
  protected readonly fotosVista = computed(() => fotosSinGuardar(this.fotos(), this.nombreFotos));
  protected quitarFoto(id: string): void {
    this.fotos.update((l) => l.filter((_, i) => String(i) !== id));
  }
  protected readonly nota = signal('');

  protected readonly lineas = computed(() => {
    const o = this.orden();
    // El motivo que dio el cliente quedó en el historial: Rechazado … “Prefiero comprar un equipo nuevo”.
    const motivo = [...o.historial].reverse().find((e) => e.texto.startsWith('Rechazado'))?.texto.match(/“(.+)”/)?.[1];
    return [
      o.diagnostico
        ? `Diagnóstico: ${o.diagnostico.resumen ?? o.diagnostico.texto}`
        : o.presupuesto
          ? `Presupuesto rechazado: ${o.presupuesto.descripcion}`
          : `Falla reportada: ${o.ficha?.falla || o.trabajo}`,
      motivo ? `Motivo del cliente: “${motivo}”` : 'El cliente no aprobó el presupuesto.',
    ];
  });

  /** Piezas que se habían apartado para esta orden: al devolver vuelven a estar disponibles. */
  protected readonly apartadas = computed(() =>
    this.inventario
      .productos()
      .flatMap((p) => p.apartados.filter((a) => a.folio === this.orden().folio).map((a) => ({ nombre: p.nombre, sku: p.sku, cantidad: a.cantidad }))),
  );

  protected readonly listo = computed(() => this.hechos().every(Boolean) && this.fotos().length > 0);

  protected entregar(): void {
    this.fotosServicio.agregarEvidencias(this.orden().folio, 'devolucion', this.fotos(), this.nombreFotos);
    this.devolver.emit(this.nota());
  }

  protected marcar(i: number, valor: boolean): void {
    this.hechos.update((l) => l.map((v, j) => (j === i ? valor : v)));
  }
}
