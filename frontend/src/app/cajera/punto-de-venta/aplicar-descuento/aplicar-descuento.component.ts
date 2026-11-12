import { AfterViewInit, Component, ElementRef, HostListener, computed, inject, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { formatearDinero } from '../../../compartido/formato';
import { MOTIVOS_DESCUENTO } from '../clientes.datos';
import { DESCUENTO_MAXIMO, IVA, VentaService, calcularTotales, redondear } from '../venta.service';

/**
 * C2.6 · Aplicar descuento (modal).
 * "Toda la venta" guarda el descuento en la venta; "Un artículo" lo pone en el % de esa línea.
 * Se escribe en % o en $ (sobre el total con IVA) y el equivalente se calcula solo. Tope: DESCUENTO_MAXIMO.
 */
@Component({
  selector: 'app-aplicar-descuento',
  standalone: true,
  imports: [DecimalPipe, FormsModule],
  templateUrl: './aplicar-descuento.component.html',
  styleUrl: './aplicar-descuento.component.css',
})
export class AplicarDescuentoComponent implements AfterViewInit {
  readonly cerrar = output<void>();

  protected readonly venta = inject(VentaService);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly dinero = formatearDinero;
  protected readonly maximo = DESCUENTO_MAXIMO;
  protected readonly motivos = MOTIVOS_DESCUENTO;

  protected readonly alcance = signal<'venta' | 'articulo'>('venta');
  protected readonly sku = signal(this.venta.lineas()[0]?.sku ?? '');
  protected readonly modo = signal<'%' | '$'>(this.venta.descuentoVenta()?.modo ?? '%');
  protected readonly valor = signal<number | null>(this.venta.descuentoVenta()?.valor ?? null);
  protected motivo = this.venta.descuentoVenta()?.motivo ?? MOTIVOS_DESCUENTO[0];

  /** Total con IVA al que se aplica el descuento: toda la venta o solo la línea elegida. */
  protected readonly base = computed(() => {
    if (this.alcance() === 'venta') return this.venta.totalSinDescuentoVenta();
    const linea = this.venta.lineas().find((l) => l.sku === this.sku());
    return linea ? redondear(linea.precio * linea.cantidad * (1 + IVA)) : 0;
  });
  protected readonly porcentaje = computed(() => {
    const valor = this.valor() ?? 0;
    return this.modo() === '%' ? valor : this.base() ? (valor / this.base()) * 100 : 0;
  });
  protected readonly monto = computed(() => {
    const valor = this.valor() ?? 0;
    return this.modo() === '$' ? valor : redondear((this.base() * valor) / 100);
  });
  protected readonly excede = computed(() => this.porcentaje() > this.maximo + 0.001);

  /** Resumen "Total antes del descuento / Descuento / Nuevo total" con IVA. */
  protected readonly antes = computed(() => {
    if (this.alcance() === 'venta') return this.venta.totalSinDescuentoVenta();
    return calcularTotales(this.lineasCon(0), this.venta.descuentoVenta()).total;
  });
  protected readonly nuevoTotal = computed(() => {
    if (this.alcance() === 'venta') {
      return calcularTotales(this.venta.lineas(), { modo: this.modo(), valor: this.valor() ?? 0, motivo: '' }).total;
    }
    return calcularTotales(this.lineasCon(this.porcentaje()), this.venta.descuentoVenta()).total;
  });

  /** Las líneas de la venta con otro % de descuento en el artículo elegido. */
  private lineasCon(porcentaje: number) {
    return this.venta.lineas().map((l) => (l.sku === this.sku() ? { ...l, descuento: porcentaje } : l));
  }

  ngAfterViewInit(): void {
    this.enfocar();
  }

  protected cambiarModo(modo: '%' | '$'): void {
    if (modo === this.modo()) return;
    // Al cambiar de unidad se conserva el mismo descuento, ahora expresado en la otra.
    const valor = this.valor();
    this.valor.set(valor === null ? null : modo === '$' ? this.monto() : redondear(this.porcentaje()));
    this.modo.set(modo);
    this.enfocar();
  }

  protected cambiarAlcance(alcance: 'venta' | 'articulo'): void {
    this.alcance.set(alcance);
    if (alcance === 'articulo') {
      const linea = this.venta.lineas().find((l) => l.sku === this.sku());
      this.modo.set('%');
      this.valor.set(linea?.descuento || null);
    }
  }

  protected leer(texto: string): void {
    const limpio = texto.replace(/[^0-9.]/g, '');
    this.valor.set(limpio ? Number(limpio) : null);
  }

  protected aplicar(): void {
    if (this.excede() || !this.valor()) return;
    if (this.alcance() === 'venta') {
      this.venta.descuentoVenta.set({ modo: this.modo(), valor: this.valor()!, motivo: this.motivo });
    } else {
      this.venta.fijarDescuento(this.sku(), this.porcentaje());
    }
    this.cerrar.emit();
  }

  protected quitar(): void {
    if (this.alcance() === 'venta') this.venta.descuentoVenta.set(null);
    else this.venta.fijarDescuento(this.sku(), 0);
    this.cerrar.emit();
  }

  @HostListener('document:keydown', ['$event'])
  protected alPresionarTecla(evento: KeyboardEvent): void {
    if (evento.key === 'Escape') this.cerrar.emit();
    if (evento.key === 'Enter' && (evento.target as HTMLElement).tagName === 'INPUT') {
      evento.preventDefault();
      this.aplicar();
    }
  }

  private enfocar(): void {
    setTimeout(() => this.elemento.nativeElement.querySelector<HTMLInputElement>('#descuento-valor')?.focus());
  }
}
