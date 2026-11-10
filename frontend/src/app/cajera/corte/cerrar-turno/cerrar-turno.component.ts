import { Component, HostListener, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { formatearDinero, formatearHora } from '../../../compartido/formato';
import { CajaService } from '../../caja.service';

export interface CierreTurno {
  contado: number;
  comentario: string;
  fondo: number;
}

const BILLETES = [500, 200, 100, 50, 20];
const MONEDAS = [10, 5, 2, 1];

/** C10.4 · Cerrar turno (modal): conteo por denominación, diferencia y fondo que se queda. */
@Component({
  selector: 'app-cerrar-turno',
  standalone: true,
  templateUrl: './cerrar-turno.component.html',
  styleUrl: './cerrar-turno.component.css',
})
export class CerrarTurnoComponent implements OnInit {
  private readonly caja = inject(CajaService);
  private readonly cajera = inject(AuthService).sesion()?.nombre ?? '';
  readonly esperado = input.required<number>();
  /** Lo que escribió en el arqueo (se usa si no cuenta por denominación). */
  readonly contadoInicial = input<number | null>(null);
  readonly comentarioInicial = input('');
  readonly cerrar = output<void>();
  readonly confirmar = output<CierreTurno>();

  protected readonly grupos = [
    BILLETES.map((valor) => ({ etiqueta: `Billete $${valor}`, valor })),
    MONEDAS.map((valor) => ({ etiqueta: `Moneda $${valor}`, valor })),
  ];
  protected readonly cantidades = signal<Record<number, number>>({});
  protected readonly centavos = signal(0);
  protected readonly comentario = signal('');
  /** Lo que la cajera escribió como fondo; sin valor, el fondo sigue al conteo. */
  private readonly fondoEscrito = signal<number | null>(null);
  protected readonly intentado = signal(false);

  /** "Turno matutino · Caja 01 · Ana Martínez · 09:00 – 15:02" */
  protected readonly subtitulo = computed(() => {
    const t = this.caja.turno();
    return t ? `Turno ${t.turno.toLowerCase()} · ${t.caja} · ${this.cajera} · ${formatearHora(new Date(t.desde))} – ${formatearHora(new Date())}` : '';
  });

  private readonly porDenominacion = computed(
    () => [...BILLETES, ...MONEDAS].reduce((s, v) => s + v * (this.cantidades()[v] ?? 0), 0) + this.centavos(),
  );
  /** Si contó por denominación manda ese total; si no, lo que escribió en el arqueo. */
  protected readonly contado = computed(() => (this.porDenominacion() > 0 ? this.porDenominacion() : (this.contadoInicial() ?? 0)));
  protected readonly diferencia = computed(() => Math.round((this.contado() - this.esperado()) * 100) / 100);
  /**
   * Fondo que se queda en la caja: el asignado, pero nunca más de lo contado. Antes se quedaba fijo en $1,000
   * y, si el conteo daba menos, el cierre se rechazaba ("Entre $0.00 y …") sin que la cajera lo notara.
   */
  protected readonly fondo = computed(() => this.fondoEscrito() ?? Math.min(this.caja.fondoAsignado, Math.max(0, this.contado())));

  protected readonly errores = computed(() => {
    const e: Record<string, string> = {};
    if (this.contado() <= 0) e['contado'] = 'Cuenta el efectivo del cajón por denominación o escríbelo en el arqueo.';
    if (this.diferencia() !== 0 && !this.comentario().trim()) e['comentario'] = 'Explica la diferencia.';
    if (this.fondo() < 0 || this.fondo() > this.contado()) e['fondo'] = `Entre $0.00 y ${formatearDinero(this.contado())}.`;
    return e;
  });

  /** Lo que falta para poder cerrar, junto al botón (los errores de cada campo pueden quedar fuera de la vista). */
  protected readonly faltantes = computed(() => Object.values(this.errores()));

  ngOnInit(): void {
    this.comentario.set(this.comentarioInicial());
  }

  protected cambiarFondo(texto: string): void {
    this.fondoEscrito.set(texto === '' ? null : Math.max(0, Number(texto) || 0));
  }

  protected dinero(importe: number): string {
    const texto = formatearDinero(Math.abs(importe));
    return importe < 0 ? `−${texto}` : texto;
  }

  protected importe(valor: number): number {
    return valor * (this.cantidades()[valor] ?? 0);
  }

  protected cambiar(valor: number, texto: string): void {
    this.cantidades.update((c) => ({ ...c, [valor]: Math.max(0, Math.floor(Number(texto) || 0)) }));
  }

  protected cambiarCentavos(texto: string): void {
    this.centavos.set(Math.max(0, Math.min(0.99, Number(texto) || 0)));
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
