import { Component, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { Orden } from '../../../cajera/ordenes/ordenes.service';
import { RefaccionesService } from '../../../jefe/refacciones/refacciones.service';
import { OrdenesService } from '../../../cajera/ordenes/ordenes.service';
import { AuthService } from '../../../acceso/auth.service';
import { FotosOrdenComponent, fotosSinGuardar } from '../../../compartido/fotos-orden/fotos-orden.component';

const PRUEBAS = ['Carga rápida', 'Pantalla y táctil', 'Cámaras y flash', 'Audio, micrófono y bocina', 'Señal, Wi-Fi y Bluetooth', 'Botones y sensores'];

/** T3.4 · Marcar como listo: pruebas finales obligatorias, fotos de salida y notas. Se avisa al cliente y a caja. */
@Component({
  selector: 'app-marcar-listo',
  standalone: true,
  imports: [FotosOrdenComponent],
  templateUrl: './marcar-listo.component.html',
  styleUrls: ['../modal-banco.css', './marcar-listo.component.css'],
})
export class MarcarListoComponent {
  private readonly refacciones = inject(RefaccionesService);

  readonly orden = input.required<Orden>();
  private readonly fotosServicio = inject(OrdenesService);
  private readonly nombreFotos = inject(AuthService).sesion()?.nombre ?? '';
  /** "1 h 12 min" */
  readonly tiempo = input('');
  readonly cerrar = output<void>();
  readonly confirmar = output<{ realizado: string; notaInterna: string }>();

  protected readonly pruebas = PRUEBAS;
  protected readonly hechas = signal<boolean[]>(PRUEBAS.map(() => false));
  /** Fotos de salida: se guardan en la orden al confirmar. */
  protected readonly fotos = signal<{ url: string; nombre: string }[]>([]);
  protected readonly fotosVista = computed(() => fotosSinGuardar(this.fotos(), this.nombreFotos));
  protected quitarFoto(id: string): void {
    this.fotos.update((l) => l.filter((_, i) => String(i) !== id));
  }
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
    if (this.faltan().length || !this.fotos().length) return;
    this.fotosServicio.agregarEvidencias(this.orden().folio, 'salida', this.fotos(), this.nombreFotos);
    this.confirmar.emit({ realizado: this.notaCliente().trim() || this.orden().presupuesto?.descripcion || this.orden().trabajo, notaInterna: this.notaInterna() });
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}
