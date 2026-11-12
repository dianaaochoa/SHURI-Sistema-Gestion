import { Component, computed, inject, input, output, signal } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { Orden, OrdenesService, TipoDictamen } from '../../../cajera/ordenes/ordenes.service';
import { formatearDinero } from '../../../compartido/formato';

const OPCIONES: { id: TipoDictamen; texto: string; detalle: string }[] = [
  { id: 'aplica', texto: 'Aplica la garantía', detalle: 'Se repara sin costo con el mismo folio' },
  { id: 'con-costo', texto: 'No aplica · ofrecer reparación con costo', detalle: 'El cliente acepta o rechaza en su portal' },
  { id: 'sin-reparar', texto: 'No aplica · devolver sin reparar', detalle: 'Sin ofrecer reparación' },
];

/** J4.2 · "Tu dictamen": aplica, no aplica con costo o devolver sin reparar. Se publica en el portal (P3.2). */
@Component({
  selector: 'app-tu-dictamen',
  standalone: true,
  templateUrl: './tu-dictamen.component.html',
  styleUrl: './tu-dictamen.component.css',
})
export class TuDictamenComponent {
  private readonly servicio = inject(OrdenesService);
  private readonly jefe = inject(AuthService).sesion()?.nombre ?? '';

  readonly orden = input.required<Orden>();
  readonly publicado = output<string>();

  protected readonly opciones = OPCIONES;
  protected readonly reporte = computed(() => this.orden().garantia?.reporte ?? null);

  /** Por defecto, lo que recomienda el técnico. */
  protected readonly elegido = signal<TipoDictamen | null>(null);
  protected readonly tipo = computed<TipoDictamen>(() => this.elegido() ?? (this.reporte()?.recomienda === 'aplica' ? 'aplica' : 'con-costo'));

  protected readonly concepto = signal<string | null>(null);
  protected readonly conceptoElegido = computed(() => this.concepto() ?? this.reporte()?.trabajo ?? '');
  protected readonly costo = signal<number | null>(null);
  protected readonly costoElegido = computed(() => this.costo() ?? this.reporte()?.costo ?? 0);

  /** Texto para el cliente según la opción (se puede editar; al cambiar de opción vuelve al sugerido). */
  protected readonly texto = signal<string | null>(null);
  protected readonly textoElegido = computed(() => {
    if (this.texto() !== null) return this.texto()!;
    const r = this.reporte();
    const hallazgo = r ? `Se encontró ${r.hallazgo.charAt(0).toLowerCase()}${r.hallazgo.slice(1)}.` : '';
    if (this.tipo() === 'aplica') return `${hallazgo} La falla está relacionada con la reparación que hicimos, así que se repara sin costo con el mismo folio.`.trim();
    const cierre = this.tipo() === 'con-costo' ? '' : ' Se devuelve como llegó, sin reparar.';
    return `${hallazgo} El daño ocurrió después de la entrega, por eso no lo cubre la garantía.${cierre}`.trim();
  });

  protected readonly consecuencia = computed(() => {
    switch (this.tipo()) {
      case 'aplica':
        return `El cliente verá el dictamen en su portal (P3.2). ${this.orden().tecnico.nombre.split(' ')[0]} repara sin costo y la orden sigue en garantía.`;
      case 'con-costo':
        return 'El cliente verá este dictamen y el costo en su portal (P3.2). Si rechaza, el equipo se devuelve sin reparar (P3.4).';
      default:
        return 'El cliente verá el dictamen en su portal (P3.2) y caja le entrega el equipo sin reparar (C6.3).';
    }
  });

  protected readonly falta = computed(() => {
    if (!this.reporte()) return 'Falta el reporte del técnico.';
    if (!this.textoElegido().trim()) return 'Escribe el dictamen para el cliente.';
    if (this.tipo() === 'con-costo' && (!this.conceptoElegido().trim() || this.costoElegido() <= 0)) return 'Pon el concepto y el costo extra.';
    return '';
  });

  protected elegir(tipo: TipoDictamen): void {
    this.elegido.set(tipo);
    this.texto.set(null);
  }

  protected publicar(): void {
    if (this.falta()) return;
    const o = this.orden();
    this.servicio.dictaminarGarantia(o.folio, { tipo: this.tipo(), texto: this.textoElegido(), concepto: this.conceptoElegido(), costo: this.costoElegido(), por: this.jefe });
    const nombre = o.cliente.nombre.split(' ')[0];
    const resumen = {
      aplica: `garantía aplicada · ${o.tecnico.nombre.split(' ')[0]} la repara sin costo`,
      'con-costo': `no aplica · se ofreció la reparación por ${formatearDinero(this.costoElegido())}`,
      'sin-reparar': 'no aplica · caja lo entrega sin reparar',
    }[this.tipo()];
    this.publicado.emit(`Dictamen de ${o.folio} publicado en el portal de ${nombre}: ${resumen}`);
  }
}
