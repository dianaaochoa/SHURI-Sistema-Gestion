import { AfterViewInit, Component, ElementRef, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { formatearDinero } from '../../../compartido/formato';
import { MetodoPago, Pago } from '../venta.service';

interface OpcionMetodo {
  id: MetodoPago | 'mixto';
  etiqueta: string;
  icono: string;
}

const METODOS: OpcionMetodo[] = [
  { id: 'efectivo', etiqueta: 'Efectivo', icono: 'cash' },
  { id: 'tarjeta', etiqueta: 'Tarjeta', icono: 'card' },
  { id: 'transferencia', etiqueta: 'Transferencia', icono: 'transfer' },
  { id: 'mixto', etiqueta: 'Mixto', icono: 'wallet' },
];

/** Bancos para "Banco de origen" de la transferencia (C2.12). */
const BANCOS = ['BBVA', 'BanCoppel', 'Banorte', 'Santander', 'Citibanamex', 'HSBC', 'Scotiabank', 'Banco Azteca', 'Nu', 'Mercado Pago', 'Otro'];

/** Montos rápidos de efectivo (Figma C2.10: para $899 → $900, $1,000, $1,500, $2,000). */
function montosRapidos(total: number): number[] {
  const arriba = (paso: number) => Math.ceil(total / paso) * paso;
  const candidatos = [arriba(100), arriba(500), arriba(1000), arriba(500) + 500, arriba(1000) + 1000];
  return [...new Set(candidatos)].filter((m) => m > total).sort((a, b) => a - b).slice(0, 4);
}

/** C2.10 efectivo · C2.11 tarjeta · C2.12 transferencia (modal "Cobrar venta"). */
@Component({
  selector: 'app-cobro',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './cobro.component.html',
  styleUrl: './cobro.component.css',
})
export class CobroComponent implements AfterViewInit {
  readonly folio = input.required<string>();
  readonly total = input.required<number>();
  readonly articulos = input.required<number>();
  readonly cliente = input.required<string>();

  readonly cerrar = output<void>();
  readonly confirmar = output<Pago>();

  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly metodos = METODOS;
  protected readonly bancos = BANCOS;
  protected readonly dinero = formatearDinero;
  protected readonly metodo = signal<MetodoPago>('efectivo');

  // Efectivo
  protected readonly recibido = signal<number | null>(null);
  protected readonly montos = computed(() => montosRapidos(this.total()));
  protected readonly cambio = computed(() => (this.recibido() ?? 0) - this.total());

  // Tarjeta
  protected tipoTarjeta: 'debito' | 'credito' = 'debito';
  protected terminal = 'BBVA · Caja 01';
  protected ultimosDigitos = '';
  protected readonly autorizacion = signal('');

  // Transferencia
  protected readonly clabe = '012 580 0123 4567 8901';
  protected bancoOrigen = BANCOS[0];
  protected readonly montoTransferencia = signal<number | null>(null);
  protected readonly rastreo = signal('');
  protected readonly verificado = signal(false);
  protected readonly copiado = signal(false);

  protected imprimir = true;
  protected enviarCorreo = false;

  protected readonly valido = computed(() => {
    switch (this.metodo()) {
      case 'efectivo':
        return this.cambio() >= 0;
      case 'tarjeta':
        return this.autorizacion().trim().length > 0;
      case 'transferencia':
        return (
          this.rastreo().trim().length > 0 && this.verificado() && (this.montoTransferencia() ?? this.total()) >= this.total()
        );
    }
  });

  ngAfterViewInit(): void {
    this.enfocarCampo();
  }

  elegirMetodo(id: OpcionMetodo['id']): void {
    if (id === 'mixto') return;
    this.metodo.set(id);
    setTimeout(() => this.enfocarCampo());
  }

  leerNumero(texto: string): number | null {
    const limpio = texto.replace(/[^0-9.]/g, '');
    return limpio ? Number(limpio) : null;
  }

  async copiarClabe(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.clabe.replace(/\s/g, ''));
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2000);
    } catch {
      // Sin permiso de portapapeles: la CLABE sigue visible para copiarla a mano.
    }
  }

  cobrar(): void {
    if (!this.valido()) return;
    const metodo = this.metodo();
    this.confirmar.emit({
      metodo,
      recibido:
        metodo === 'efectivo' ? this.recibido() ?? 0 : metodo === 'transferencia' ? this.montoTransferencia() ?? this.total() : this.total(),
      referencia: metodo === 'tarjeta' ? this.autorizacion() : metodo === 'transferencia' ? this.rastreo() : undefined,
      imprimir: this.imprimir,
      enviarCorreo: this.enviarCorreo,
    });
  }

  @HostListener('document:keydown', ['$event'])
  protected alPresionarTecla(evento: KeyboardEvent): void {
    if (evento.key === 'Escape') this.cerrar.emit();
    if (evento.key === 'Enter' && (evento.target as HTMLElement).tagName !== 'BUTTON') {
      evento.preventDefault();
      this.cobrar();
    }
  }

  private enfocarCampo(): void {
    this.elemento.nativeElement.querySelector<HTMLInputElement>('.cobro__enfoque')?.focus();
  }
}
