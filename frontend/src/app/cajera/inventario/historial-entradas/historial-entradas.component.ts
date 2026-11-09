import { Component, HostListener, computed, inject, input, signal } from '@angular/core';
import { formatearDinero } from '../../../compartido/formato';
import { diaMes } from '../../ordenes/detalle-orden/detalle-orden.component';
import { DispositivosService } from '../../punto-de-venta/dispositivos.service';
import { Entrada, FORMAS_PAGO } from '../inventario.datos';
import { InventarioService } from '../inventario.service';

const clave = (iso: string) => {
  const f = new Date(iso);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
};

/** Meses con entradas, del más reciente al más antiguo ("Octubre 2026"). */
export function mesesDe(entradas: Entrada[]): { clave: string; texto: string }[] {
  const claves = [...new Set([clave(new Date().toISOString()), ...entradas.map((e) => clave(e.fecha))])].sort().reverse();
  return claves.map((c) => {
    const [anio, mes] = c.split('-').map(Number);
    const nombre = new Date(anio, mes - 1, 1).toLocaleDateString('es-MX', { month: 'long' });
    return { clave: c, texto: `${nombre[0].toUpperCase()}${nombre.slice(1)} ${anio}` };
  });
}

function fechaCorta(iso: string): string {
  const dias = Math.round((new Date(new Date().toDateString()).getTime() - new Date(new Date(iso).toDateString()).getTime()) / 86400000);
  return dias === 0 ? 'Hoy' : dias === 1 ? 'Ayer' : diaMes(iso);
}

/** C7.7 · Historial de entradas (y su detalle al pulsar "Ver"). */
@Component({
  selector: 'app-historial-entradas',
  standalone: true,
  templateUrl: './historial-entradas.component.html',
  styleUrl: './historial-entradas.component.css',
})
export class HistorialEntradasComponent {
  private readonly inventario = inject(InventarioService);
  private readonly dispositivos = inject(DispositivosService);
  readonly mes = input.required<string>();

  protected readonly dinero = formatearDinero;
  protected readonly formas = FORMAS_PAGO;
  protected readonly fechaCorta = fechaCorta;

  protected readonly lista = computed(() => this.inventario.entradas().filter((e) => clave(e.fecha) === this.mes()));
  protected readonly notas = computed(() => this.lista().filter((e) => e.nota));
  protected readonly totales = computed(() => ({
    total: this.lista().reduce((s, e) => s + e.total, 0),
    efectivo: this.lista().filter((e) => e.pago === 'efectivo').reduce((s, e) => s + e.total, 0),
  }));

  protected piezas(e: Entrada): number {
    return e.lineas.reduce((s, l) => s + l.cantidad, 0);
  }

  // ---------- Detalle ----------
  protected readonly detalle = signal<Entrada | null>(null);
  protected readonly mensaje = signal<string | null>(null);

  protected ver(e: Entrada): void {
    this.mensaje.set(null);
    this.detalle.set(e);
  }

  protected reimprimir(e: Entrada): void {
    this.mensaje.set(this.dispositivos.imprimir(e.folio) ? `Comprobante de ${e.folio} impreso` : 'La impresora no responde: revisa que esté encendida, con papel y conectada');
  }

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    this.detalle.set(null);
  }
}
