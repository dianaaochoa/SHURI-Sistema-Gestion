import { Component, computed, inject, input, output, signal } from '@angular/core';
import { InventarioService } from '../../../cajera/inventario/inventario.service';
import { Concepto, Orden, importeConceptos } from '../../../cajera/ordenes/ordenes.service';
import { formatearDinero } from '../../../compartido/formato';
import { REGLAS_TALLER } from '../../../compartido/reglas-taller';
import { diaMes } from '../existencia';

export interface DatosEnvio {
  descuento: number;
  mensaje: string;
  vigenciaDias: number;
  /** ISO de la entrega estimada (vacío si no se puso). */
  entrega: string;
}

const VIGENCIAS = [3, 7, 15, 30];

/** J3.2 · "Total para el cliente": totales, utilidad (solo el jefe), entrega, vigencia, mensaje y envío. */
@Component({
  selector: 'app-resumen-cotizacion',
  standalone: true,
  templateUrl: './resumen-cotizacion.component.html',
  styleUrl: './resumen-cotizacion.component.css',
})
export class ResumenCotizacionComponent {
  private readonly inventario = inject(InventarioService);

  readonly orden = input.required<Orden>();
  readonly conceptos = input.required<Concepto[]>();
  readonly enviar = output<DatosEnvio>();
  readonly regresar = output<void>();

  protected readonly dinero = formatearDinero;
  protected readonly vigencias = VIGENCIAS;

  protected readonly descuento = signal(0);
  protected readonly vigencia = signal(REGLAS_TALLER.vigenciaDias);
  protected readonly entrega = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);

  protected readonly refacciones = computed(() => importeConceptos(this.conceptos().filter((c) => c.tipo !== 'mano-obra')));
  protected readonly manoObra = computed(() => importeConceptos(this.conceptos().filter((c) => c.tipo === 'mano-obra')));
  protected readonly total = computed(() => Math.max(0, this.refacciones() + this.manoObra() - this.descuento()));
  protected readonly restante = computed(() => Math.max(0, this.total() - this.orden().anticipo));

  /** Lo que gana el taller sin IVA: total ÷ 1.16 − costo de las piezas (misma regla que el margen de Inventario). */
  protected readonly utilidad = computed(() => {
    const neto = this.total() / 1.16;
    const costos = this.conceptos().reduce((s, c) => s + c.cantidad * c.costo, 0);
    const importe = Math.round((neto - costos) * 100) / 100;
    return { importe, porcentaje: neto > 0 ? Math.round((importe / neto) * 100) : 0 };
  });

  /** Por defecto: la fecha prometida, o la llegada de la pieza que falta, o pasado mañana. */
  protected readonly entregaElegida = computed(() => {
    if (this.entrega() !== null) return this.entrega()!;
    const llegadas = this.conceptos()
      .filter((c) => c.sku && this.inventario.paraOrden(c.sku, this.orden().folio) < c.cantidad)
      .map((c) => this.inventario.llegada(c.sku!))
      .filter((f): f is string => !!f)
      .sort();
    const base = llegadas.length ? new Date(llegadas[llegadas.length - 1]) : this.orden().prometida ? new Date(this.orden().prometida!) : new Date(Date.now() + 2 * 86_400_000);
    return paraInput(base);
  });

  /** "Se cambia batería y conector. El conector llega el 17 oct." */
  protected readonly mensajeElegido = computed(() => {
    if (this.mensaje() !== null) return this.mensaje()!;
    const piezas = this.conceptos().filter((c) => c.tipo !== 'mano-obra' && c.descripcion.trim());
    if (!piezas.length) return '';
    const nombres = piezas.map((c) => minuscula(c.descripcion.trim()));
    const lista = nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}` : nombres[0];
    const faltan = piezas
      .filter((c) => c.sku && this.inventario.paraOrden(c.sku, this.orden().folio) < c.cantidad && this.inventario.llegada(c.sku))
      .map((c) => ` ${c.descripcion.trim()} llega el ${diaMes(this.inventario.llegada(c.sku!)!)}.`);
    return `Se cambia ${lista}.${faltan.join('')}`;
  });

  protected readonly falta = computed(() => {
    if (!this.conceptos().length) return 'Agrega al menos un concepto.';
    if (this.conceptos().some((c) => !c.descripcion.trim())) return 'Escribe la descripción del concepto manual.';
    if (this.conceptos().some((c) => c.precio <= 0)) return 'Pon el precio público de cada concepto.';
    if (!this.mensajeElegido().trim()) return 'Escribe el mensaje para el cliente.';
    return '';
  });

  protected cambiarDescuento(valor: string): void {
    this.descuento.set(Math.min(Math.max(0, Number(valor) || 0), this.refacciones() + this.manoObra()));
  }

  protected confirmar(): void {
    if (this.falta()) return;
    const entrega = this.entregaElegida();
    this.enviar.emit({ descuento: this.descuento(), mensaje: this.mensajeElegido(), vigenciaDias: this.vigencia(), entrega: entrega ? new Date(`${entrega}T18:00`).toISOString() : '' });
  }
}

const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/** "2026-11-10" para <input type="date">. */
function paraInput(fecha: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}
