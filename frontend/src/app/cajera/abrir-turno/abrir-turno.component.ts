import { AfterViewInit, Component, ElementRef, HostListener, computed, inject, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../acceso/auth.service';
import { CampoDineroDirective } from '../../compartido/campo-dinero.directive';
import { formatearDinero, formatearFechaCorta, formatearHora } from '../../compartido/formato';
import { CajaService, NombreTurno } from '../caja.service';

/** C1.3 · Abrir turno de caja (modal): la cajera escribe el total del fondo inicial (sin contar por denominación). */
@Component({
  selector: 'app-abrir-turno',
  standalone: true,
  imports: [FormsModule, CampoDineroDirective],
  templateUrl: './abrir-turno.component.html',
  styleUrl: './abrir-turno.component.css',
})
export class AbrirTurnoComponent implements AfterViewInit {
  readonly cerrar = output<void>();

  private readonly caja = inject(CajaService);
  private readonly router = inject(Router);
  /** Turno que otra cajera dejó abierto: hasta su corte no se puede abrir otro. */
  protected readonly ajeno = this.caja.ajeno;
  protected hora(iso: string): string {
    return formatearHora(new Date(iso));
  }
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly cajera = inject(AuthService).sesion()?.nombre ?? '';
  protected readonly cajas = this.caja.cajas;
  protected readonly fondoAsignado = this.caja.fondoAsignado;

  protected readonly fecha = formatearFechaCorta(new Date());
  protected readonly turnos: NombreTurno[] = ['Matutino', 'Vespertino'];
  protected cajaElegida = this.cajas[0];
  protected turnoElegido: NombreTurno = new Date().getHours() < 14 ? 'Matutino' : 'Vespertino';

  /** Total del fondo inicial que escribe la cajera. */
  protected readonly fondo = signal<number | null>(null);
  protected readonly total = computed(() => this.fondo() ?? 0);
  protected readonly diferencia = computed(() => this.total() - this.fondoAsignado);
  protected readonly dinero = formatearDinero;

  ngAfterViewInit(): void {
    this.elemento.nativeElement.querySelector<HTMLInputElement>('#fondo-inicial')?.focus();
  }

  abrir(): void {
    if (!this.total()) return;
    this.caja.abrirTurno({ caja: this.cajaElegida, turno: this.turnoElegido, fondo: this.total() });
    this.cerrar.emit();
  }

  protected irACorte(): void {
    this.cerrar.emit();
    this.router.navigateByUrl('/cajera/corte-de-caja');
  }

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    this.cerrar.emit();
  }
}
