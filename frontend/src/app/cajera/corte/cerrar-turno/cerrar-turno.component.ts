import { Component, HostListener, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { CampoDineroDirective } from '../../../compartido/campo-dinero.directive';
import { formatearDinero, formatearHora } from '../../../compartido/formato';
import { CajaService } from '../../caja.service';
import { VentaService } from '../../punto-de-venta/venta.service';

export interface CierreTurno {
  contado: number;
  comentario: string;
  fondo: number;
}

/** C10.4 · Cerrar turno (modal): total contado, diferencia y fondo que se queda (sin contar por denominación). */
@Component({
  selector: 'app-cerrar-turno',
  standalone: true,
  imports: [CampoDineroDirective],
  templateUrl: './cerrar-turno.component.html',
  styleUrl: './cerrar-turno.component.css',
})
export class CerrarTurnoComponent implements OnInit {
  private readonly caja = inject(CajaService);
  /** Ventas en espera y venta sin cobrar que se descartan al cerrar (C2.9). */
  private readonly pendientes = inject(VentaService).pendientesDelTurno;
  protected readonly avisoPendientes = computed(() => {
    const { enEspera, enCurso } = this.pendientes();
    const partes = [enEspera ? (enEspera === 1 ? '1 venta en espera' : `${enEspera} ventas en espera`) : '', enCurso ? 'la venta sin cobrar del punto de venta' : ''].filter(Boolean);
    return partes.length ? `Al cerrar se descartan ${partes.join(' y ')}: no se cobraron ni apartan inventario.` : null;
  });
  private readonly cajera = inject(AuthService).sesion()?.nombre ?? '';
  readonly esperado = input.required<number>();
  /** Lo que escribió en el arqueo: llega ya puesto como lo contado. */
  readonly contadoInicial = input<number | null>(null);
  readonly comentarioInicial = input('');
  readonly cerrar = output<void>();
  readonly confirmar = output<CierreTurno>();

  /** Total que escribe la cajera (arranca con lo del arqueo). */
  protected readonly contadoEscrito = signal<number | null>(null);
  protected readonly comentario = signal('');
  /** Lo que la cajera escribió como fondo; sin valor, el fondo sigue al conteo. */
  protected readonly fondoEscrito = signal<number | null>(null);
  protected readonly intentado = signal(false);

  /** "Turno matutino · Caja 01 · Ana Martínez · 09:00 – 15:02" */
  protected readonly subtitulo = computed(() => {
    const t = this.caja.turnoDeCaja();
    return t ? `Turno ${t.turno.toLowerCase()} · ${t.caja} · ${t.cajera ?? this.cajera} · ${formatearHora(new Date(t.desde))} – ${formatearHora(new Date())}` : '';
  });

  protected readonly contado = computed(() => this.contadoEscrito() ?? 0);
  protected readonly diferencia = computed(() => Math.round((this.contado() - this.esperado()) * 100) / 100);
  /**
   * Fondo que se queda en la caja: el asignado, pero nunca más de lo contado. Antes se quedaba fijo en $1,000
   * y, si el conteo daba menos, el cierre se rechazaba ("Entre $0.00 y …") sin que la cajera lo notara.
   */
  protected readonly fondo = computed(() => this.fondoEscrito() ?? Math.min(this.caja.fondoAsignado, Math.max(0, this.contado())));

  protected readonly errores = computed(() => {
    const e: Record<string, string> = {};
    if (this.contado() <= 0) e['contado'] = 'Escribe cuánto efectivo hay en el cajón.';
    if (this.diferencia() !== 0 && !this.comentario().trim()) e['comentario'] = 'Explica la diferencia.';
    if (this.fondo() < 0 || this.fondo() > this.contado()) e['fondo'] = `Entre $0.00 y ${formatearDinero(this.contado())}.`;
    return e;
  });

  /** Lo que falta para poder cerrar, junto al botón (los errores de cada campo pueden quedar fuera de la vista). */
  protected readonly faltantes = computed(() => Object.values(this.errores()));

  ngOnInit(): void {
    this.comentario.set(this.comentarioInicial());
    this.contadoEscrito.set(this.contadoInicial());
  }

  protected dinero(importe: number): string {
    const texto = formatearDinero(Math.abs(importe));
    return importe < 0 ? `−${texto}` : texto;
  }

  protected cerrarTurno(): void {
    this.intentado.set(true);
    if (Object.keys(this.errores()).length) return;
    this.confirmar.emit({ contado: this.contado(), comentario: this.comentario().trim(), fondo: this.fondo() });
  }

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    this.cerrar.emit();
  }
}
