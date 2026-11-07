import { AfterViewInit, Component, ElementRef, HostListener, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../acceso/auth.service';
import { formatearDinero, formatearFechaCorta } from '../../compartido/formato';
import { CajaService, NombreTurno } from '../caja.service';

interface Denominacion {
  etiqueta: string;
  valor: number;
}

const BILLETES: Denominacion[] = [500, 200, 100, 50, 20].map((valor) => ({ etiqueta: `Billete $${valor}`, valor }));
const MONEDAS: Denominacion[] = [10, 5, 2, 1].map((valor) => ({ etiqueta: `Moneda $${valor}`, valor }));

/** C1.3 · Abrir turno de caja (modal): conteo del fondo inicial por denominación. */
@Component({
  selector: 'app-abrir-turno',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './abrir-turno.component.html',
  styleUrl: './abrir-turno.component.css',
})
export class AbrirTurnoComponent implements AfterViewInit {
  readonly cerrar = output<void>();

  private readonly caja = inject(CajaService);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly cajera = inject(AuthService).sesion()?.nombre ?? '';
  protected readonly cajas = this.caja.cajas;
  protected readonly fondoAsignado = this.caja.fondoAsignado;
  protected readonly billetes = BILLETES;
  protected readonly monedas = MONEDAS;

  protected readonly fecha = formatearFechaCorta(new Date());
  protected readonly turnos: NombreTurno[] = ['Matutino', 'Vespertino'];
  protected cajaElegida = this.cajas[0];
  protected turnoElegido: NombreTurno = new Date().getHours() < 14 ? 'Matutino' : 'Vespertino';

  /** Cantidad de piezas por valor de denominación; los centavos se capturan como importe. */
  protected readonly cantidades = signal<Record<number, number>>({});
  protected readonly centavos = signal(0);

  protected readonly total = computed(
    () =>
      [...BILLETES, ...MONEDAS].reduce((suma, d) => suma + d.valor * (this.cantidades()[d.valor] ?? 0), 0) +
      this.centavos(),
  );
  protected readonly diferencia = computed(() => this.total() - this.fondoAsignado);
  protected readonly dinero = formatearDinero;

  ngAfterViewInit(): void {
    this.elemento.nativeElement.querySelector<HTMLInputElement>('.conteo input')?.focus();
  }

  importe(valor: number): number {
    return valor * (this.cantidades()[valor] ?? 0);
  }

  cambiarCantidad(valor: number, texto: string): void {
    const cantidad = Math.max(0, Math.floor(Number(texto) || 0));
    this.cantidades.update((actual) => ({ ...actual, [valor]: cantidad }));
  }

  cambiarCentavos(texto: string): void {
    this.centavos.set(Math.max(0, Math.min(0.99, Number(texto) || 0)));
  }

  abrir(): void {
    if (!this.total()) return;
    this.caja.abrirTurno({ caja: this.cajaElegida, turno: this.turnoElegido, fondo: this.total() });
    this.cerrar.emit();
  }

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    this.cerrar.emit();
  }
}
