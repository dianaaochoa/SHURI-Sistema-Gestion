import { Component, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { Orden } from '../../../cajera/ordenes/ordenes.service';
import { RefaccionesService } from '../../../jefe/refacciones/refacciones.service';
import { FotosComponent } from '../fotos/fotos.component';

const PRUEBAS = ['Carga rápida', 'Pantalla y táctil', 'Cámaras y flash', 'Audio, micrófono y bocina', 'Señal, Wi-Fi y Bluetooth', 'Botones y sensores'];

/** T3.4 · Marcar como listo: pruebas finales obligatorias, fotos de salida y notas. Se avisa al cliente y a caja. */
@Component({
  selector: 'app-marcar-listo',
  standalone: true,
  imports: [FotosComponent],
  templateUrl: './marcar-listo.component.html',
  styleUrls: ['../modal-banco.css', './marcar-listo.component.css'],
})
export class MarcarListoComponent {
  private readonly refacciones = inject(RefaccionesService);

  readonly orden = input.required<Orden>();
  /** "1 h 12 min" */
  readonly tiempo = input('');
  readonly cerrar = output<void>();
  readonly confirmar = output<{ realizado: string; notaInterna: string }>();

  protected readonly pruebas = PRUEBAS;
  protected readonly hechas = signal<boolean[]>(PRUEBAS.map(() => false));
  protected readonly fotos = signal(0);
  protected readonly notaCliente = signal('');
  protected readonly notaInterna = signal('');
  protected readonly intentado = signal(false);

  protected readonly garantia = computed(() => this.orden().estado === 'en-garantia');
  protected readonly faltan = computed(() => PRUEBAS.filter((_, i) => !this.hechas()[i]));
  protected readonly usadas = computed(() => this.refacciones.solicitudes().filter((s) => s.orden === this.orden().folio && s.estado === 'entregada'));

  protected marcar(i: number, valor: boolean): void {
    this.hechas.update((l) => l.map((v, j) => (j === i ? valor : v)));
  }

  protected mandar(): void {
    this.intentado.set(true);
    if (this.faltan().length || !this.fotos()) return;
    this.confirmar.emit({ realizado: this.notaCliente().trim() || this.orden().presupuesto?.descripcion || this.orden().trabajo, notaInterna: this.notaInterna() });
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}
