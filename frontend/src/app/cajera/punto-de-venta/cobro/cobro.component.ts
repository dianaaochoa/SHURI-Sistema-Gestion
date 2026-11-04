import { AfterViewInit, Component, ElementRef, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { formatearDinero } from '../../../compartido/formato';
import { Cliente, DatosFiscales } from '../clientes.datos';
import { DatosFacturaComponent } from '../datos-factura/datos-factura.component';
import { DispositivosService } from '../dispositivos.service';
import { PagoMixtoComponent, resumenMixto } from '../pago-mixto/pago-mixto.component';
import { TarjetaRechazadaComponent } from '../tarjeta-rechazada/tarjeta-rechazada.component';
import { MetodoPago, ParteMixta, Pago } from '../venta.service';

interface OpcionMetodo {
  id: MetodoPago;
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

/** Terminación de tarjeta que la terminal de prueba rechaza (C2.14). */
const TARJETA_RECHAZADA = '0000';

/**
 * Modal "Cobrar venta": C2.10 efectivo · C2.11 tarjeta · C2.12 transferencia · C2.13 mixto ·
 * C2.14 tarjeta rechazada · C2.18 datos de facturación.
 */
@Component({
  selector: 'app-cobro',
  standalone: true,
  imports: [FormsModule, DatosFacturaComponent, PagoMixtoComponent, TarjetaRechazadaComponent],
  templateUrl: './cobro.component.html',
  styleUrl: './cobro.component.css',
})
export class CobroComponent implements AfterViewInit {
  readonly folio = input.required<string>();
  readonly total = input.required<number>();
  readonly articulos = input.required<number>();
  readonly cliente = input.required<Cliente>();

  readonly cerrar = output<void>();
  readonly confirmar = output<Pago>();

  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Sin conexión no hay transferencias ni facturas (C2.16). */
  protected readonly enLinea = inject(DispositivosService).enLinea;

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
  /** Motivo del rechazo de la terminal (C2.14). */
  protected readonly rechazo = signal<string | null>(null);

  // Mixto (C2.13): efectivo y tarjeta, como en Figma.
  protected readonly partes = signal<ParteMixta[]>([
    { metodo: 'efectivo', monto: null, referencia: '' },
    { metodo: 'tarjeta', monto: null, referencia: '' },
  ]);
  private readonly mixto = computed(() => resumenMixto(this.partes(), this.total()));

  // Transferencia
  protected readonly clabe = '012 580 0123 4567 8901';
  protected bancoOrigen = BANCOS[0];
  protected readonly montoTransferencia = signal<number | null>(null);
  protected readonly rastreo = signal('');
  protected readonly verificado = signal(false);
  protected readonly copiado = signal(false);

  protected imprimir = true;
  protected enviarCorreo = false;

  // Factura (C2.18)
  protected readonly factura = signal<DatosFiscales | null>(null);
  protected readonly facturaAbierta = signal(false);

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
      case 'mixto':
        return this.mixto().valido;
    }
  });

  ngAfterViewInit(): void {
    this.enfocarCampo();
  }

  elegirMetodo(id: MetodoPago): void {
    if (id === 'transferencia' && !this.enLinea()) return;
    this.rechazo.set(null);
    this.metodo.set(id);
    setTimeout(() => this.enfocarCampo());
  }

  // C2.14: opciones después de un rechazo.
  protected reintentarTarjeta(): void {
    this.rechazo.set(null);
    setTimeout(() => this.enfocarCampo());
  }

  protected usarOtraTarjeta(): void {
    this.ultimosDigitos = '';
    this.autorizacion.set('');
    this.rechazo.set(null);
    setTimeout(() => this.elemento.nativeElement.querySelector<HTMLInputElement>('#digitos')?.focus());
  }

  // C2.18
  protected alternarFactura(marcada: boolean): void {
    if (marcada) this.facturaAbierta.set(true);
    else this.factura.set(null);
  }

  protected guardarFactura(datos: DatosFiscales): void {
    this.factura.set(datos);
    this.facturaAbierta.set(false);
  }

  protected quitarFactura(): void {
    this.factura.set(null);
    this.facturaAbierta.set(false);
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
    if (!this.valido() || this.rechazo()) return;
    const metodo = this.metodo();
    // Terminal simulada: rechaza la tarjeta terminada en 0000 (C2.14).
    if (metodo === 'tarjeta' && this.ultimosDigitos.trim() === TARJETA_RECHAZADA) {
      this.rechazo.set('fondos insuficientes (código 51)');
      return;
    }
    const recibido = {
      efectivo: this.recibido() ?? 0,
      tarjeta: this.total(),
      transferencia: this.montoTransferencia() ?? this.total(),
      mixto: this.mixto().pagado,
    }[metodo];
    this.confirmar.emit({
      metodo,
      recibido,
      referencia: metodo === 'tarjeta' ? this.autorizacion() : metodo === 'transferencia' ? this.rastreo() : undefined,
      partes: metodo === 'mixto' ? this.partes() : undefined,
      imprimir: this.imprimir,
      enviarCorreo: this.enviarCorreo,
      factura: this.factura(),
    });
  }

  @HostListener('document:keydown', ['$event'])
  protected alPresionarTecla(evento: KeyboardEvent): void {
    // Con el modal de factura encima, las teclas son suyas.
    if (this.facturaAbierta()) return;
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
