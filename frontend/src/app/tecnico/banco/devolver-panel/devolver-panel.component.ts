import { Component, computed, inject, input, output, signal } from '@angular/core';
import { InventarioService } from '../../../cajera/inventario/inventario.service';
import { Orden } from '../../../cajera/ordenes/ordenes.service';
import { FichaEquipoComponent } from '../ficha-equipo/ficha-equipo.component';
import { FotosComponent } from '../fotos/fotos.component';

const REVISION = ['Equipo armado y con todos sus tornillos', 'Enciende igual que al recibirlo', 'Sin piezas ni etiquetas del taller'];

/** T3.9 · Presupuesto rechazado: el técnico arma el equipo como llegó y lo devuelve a caja. */
@Component({
  selector: 'app-devolver-panel',
  standalone: true,
  imports: [FichaEquipoComponent, FotosComponent],
  templateUrl: './devolver-panel.component.html',
  styleUrls: ['../banco-comun.css', './devolver-panel.component.css'],
})
export class DevolverPanelComponent {
  private readonly inventario = inject(InventarioService);

  readonly orden = input.required<Orden>();
  readonly devolver = output<string>();

  protected readonly revision = REVISION;
  protected readonly hechos = signal<boolean[]>(REVISION.map(() => false));
  protected readonly fotos = signal(0);
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

  protected readonly listo = computed(() => this.hechos().every(Boolean) && this.fotos() > 0);

  protected marcar(i: number, valor: boolean): void {
    this.hechos.update((l) => l.map((v, j) => (j === i ? valor : v)));
  }
}
