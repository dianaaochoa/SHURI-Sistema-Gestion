import { Component, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { formatearDinero } from '../../compartido/formato';
import { AbrirTurnoComponent } from '../abrir-turno/abrir-turno.component';
import { CajaService } from '../caja.service';
import { AplicarDescuentoComponent } from './aplicar-descuento/aplicar-descuento.component';
import { BarraBusquedaComponent } from './barra-busqueda/barra-busqueda.component';
import { CobroComponent } from './cobro/cobro.component';
import { PausarVentaComponent } from './pausar-venta/pausar-venta.component';
import { ProductoTemporalComponent } from './producto-temporal/producto-temporal.component';
import { SeleccionarClienteComponent } from './seleccionar-cliente/seleccionar-cliente.component';
import { TablaTicketComponent } from './tabla-ticket/tabla-ticket.component';
import { Pago, ProductoTemporal, VentaService } from './venta.service';
import { VentasEnEsperaComponent } from './ventas-en-espera/ventas-en-espera.component';

type Modal = 'cobro' | 'cancelar' | 'temporal' | 'cliente' | 'descuento' | 'pausar' | 'espera';

/** Atajos de la barra inferior (Figma C2.1). */
const ATAJOS = [
  { tecla: 'F2', accion: 'Buscar' },
  { tecla: 'F4', accion: 'Cliente' },
  { tecla: 'F6', accion: 'Descuento' },
  { tecla: 'F7', accion: 'Producto temporal' },
  { tecla: 'F8', accion: 'Pausar' },
  { tecla: 'F9', accion: 'En espera' },
  { tecla: 'F12', accion: 'Cobrar' },
  { tecla: 'Esc', accion: 'Cancelar' },
];

/**
 * C2 · Punto de venta.
 * C2.1 venta activa · C2.2 carrito vacío · C2.3/C2.4 búsqueda (BarraBusqueda) · C2.5 cliente ·
 * C2.6 descuento · C2.7 producto temporal · C2.8 pausar · C2.9 en espera · C2.10–C2.12 cobro.
 */
@Component({
  selector: 'app-punto-de-venta',
  standalone: true,
  imports: [
    RouterLink,
    AbrirTurnoComponent,
    AplicarDescuentoComponent,
    BarraBusquedaComponent,
    CobroComponent,
    PausarVentaComponent,
    ProductoTemporalComponent,
    SeleccionarClienteComponent,
    TablaTicketComponent,
    VentasEnEsperaComponent,
  ],
  templateUrl: './punto-de-venta.component.html',
  styleUrl: './punto-de-venta.component.css',
})
export class PuntoDeVentaComponent {
  protected readonly venta = inject(VentaService);
  protected readonly caja = inject(CajaService);
  private readonly router = inject(Router);
  private readonly barra = viewChild.required(BarraBusquedaComponent);

  protected readonly atajos = ATAJOS;
  protected readonly dinero = formatearDinero;

  protected readonly modal = signal<Modal | null>(null);
  protected readonly datosTemporal = signal<{ nombre: string; precio: number | null }>({ nombre: '', precio: null });
  /** Aviso verde sobre el ticket: venta cobrada, pausada o retomada. */
  protected readonly aviso = signal<string | null>(null);
  protected readonly modalAbierto = computed(() => this.modal() !== null || !this.caja.abierta());

  abrir(modal: Modal): void {
    // Cliente, descuento, pausar y cobrar solo tienen sentido con artículos en el ticket.
    if (['descuento', 'pausar', 'cobro', 'cancelar'].includes(modal) && this.venta.vacia()) return;
    if (modal === 'cobro') this.barra().limpiar();
    this.modal.set(modal);
  }

  cerrarModal(): void {
    this.modal.set(null);
    this.barra().enfocar();
  }

  abrirTemporal(datos: { nombre: string; precio: number | null } = { nombre: '', precio: null }): void {
    this.datosTemporal.set(datos);
    this.modal.set('temporal');
  }

  agregarTemporal(datos: ProductoTemporal): void {
    this.venta.agregarTemporal(datos);
    this.aviso.set(null);
    this.cerrarModal();
  }

  confirmarCobro(pago: Pago): void {
    const cobrada = this.venta.cobrar(pago);
    const detalle =
      cobrada.metodo === 'efectivo'
        ? `entrega ${formatearDinero(cobrada.cambio)} de cambio`
        : cobrada.metodo === 'tarjeta'
          ? 'pagada con tarjeta'
          : 'pagada por transferencia';
    this.aviso.set(`Venta ${cobrada.folio} cobrada · ${formatearDinero(cobrada.total)} · ${detalle}`);
    this.cerrarModal();
  }

  alPausar(folio: string): void {
    this.aviso.set(`Venta ${folio} en espera · la caja quedó libre para otro cliente`);
    this.cerrarModal();
  }

  alRetomar(folio: string): void {
    this.aviso.set(`Retomaste la venta ${folio}`);
    this.cerrarModal();
  }

  cancelarVenta(): void {
    this.venta.cancelar();
    this.aviso.set(null);
    this.cerrarModal();
  }

  /** Si la cajera cierra el modal de abrir turno sin abrirlo, vuelve al inicio: sin caja no se cobra. */
  alCerrarAbrirTurno(): void {
    if (!this.caja.abierta()) this.router.navigateByUrl('/cajera/inicio');
  }

  /**
   * En document (no en window) para correr antes que los listeners de los modales, que se registran
   * después: así un Esc que cierra un modal no llega aquí ya cerrado y abre "Cancelar venta".
   */
  @HostListener('document:keydown', ['$event'])
  protected alPresionarTecla(evento: KeyboardEvent): void {
    if (this.modalAbierto()) return;
    const objetivo = (evento.target as HTMLElement).tagName;
    const teclas: Record<string, () => void> = {
      F2: () => this.barra().enfocar(),
      F4: () => this.abrir('cliente'),
      F6: () => this.abrir('descuento'),
      F7: () => this.abrirTemporal(),
      F8: () => this.abrir('pausar'),
      F9: () => this.abrir('espera'),
      F12: () => this.abrir('cobro'),
    };
    if (teclas[evento.key]) {
      evento.preventDefault();
      teclas[evento.key]();
    } else if (evento.key === 'Enter' && !['INPUT', 'BUTTON', 'A', 'SELECT'].includes(objetivo)) {
      this.abrir('cobro');
    } else if (evento.key === 'Escape') {
      this.abrir('cancelar');
    }
  }
}
