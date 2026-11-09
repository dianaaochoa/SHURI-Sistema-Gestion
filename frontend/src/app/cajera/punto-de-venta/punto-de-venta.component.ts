import { Component, HostListener, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { formatearDinero } from '../../compartido/formato';
import { AbrirTurnoComponent } from '../abrir-turno/abrir-turno.component';
import { CajaService } from '../caja.service';
import { HistorialVentasService } from '../ventas/historial-ventas.service';
import { AplicarDescuentoComponent } from './aplicar-descuento/aplicar-descuento.component';
import { AtajosTecladoComponent } from './atajos-teclado/atajos-teclado.component';
import { AvisoSinConexionComponent } from './aviso-sin-conexion/aviso-sin-conexion.component';
import { BarraBusquedaComponent } from './barra-busqueda/barra-busqueda.component';
import { CobroComponent } from './cobro/cobro.component';
import { DispositivosService } from './dispositivos.service';
import { ErrorImpresoraComponent } from './error-impresora/error-impresora.component';
import { PausarVentaComponent } from './pausar-venta/pausar-venta.component';
import { ProductoTemporalComponent } from './producto-temporal/producto-temporal.component';
import { SeleccionarClienteComponent } from './seleccionar-cliente/seleccionar-cliente.component';
import { TablaTicketComponent } from './tabla-ticket/tabla-ticket.component';
import { Pago, ProductoTemporal, VentaCobrada, VentaService } from './venta.service';
import { VentasEnEsperaComponent } from './ventas-en-espera/ventas-en-espera.component';
import { DocumentosService } from '../documentos/documentos.service';

type Modal = 'cobro' | 'cancelar' | 'temporal' | 'cliente' | 'descuento' | 'pausar' | 'espera' | 'impresora' | 'atajos';

const NOMBRE_METODO = { efectivo: 'efectivo', tarjeta: 'tarjeta', transferencia: 'transferencia' };

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
 * C2.6 descuento · C2.7 producto temporal · C2.8 pausar · C2.9 en espera · C2.10–C2.14 y C2.18 cobro ·
 * C2.15 error de impresora · C2.16 sin conexión · C2.17 atajos.
 */
@Component({
  selector: 'app-punto-de-venta',
  standalone: true,
  imports: [
    RouterLink,
    AbrirTurnoComponent,
    AplicarDescuentoComponent,
    AtajosTecladoComponent,
    AvisoSinConexionComponent,
    BarraBusquedaComponent,
    CobroComponent,
    ErrorImpresoraComponent,
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
  protected readonly dispositivos = inject(DispositivosService);
  private readonly documentos = inject(DocumentosService);
  private readonly historial = inject(HistorialVentasService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly barra = viewChild.required(BarraBusquedaComponent);

  protected readonly atajos = ATAJOS;
  protected readonly dinero = formatearDinero;

  protected readonly modal = signal<Modal | null>(null);
  protected readonly datosTemporal = signal<{ nombre: string; precio: number | null }>({ nombre: '', precio: null });
  /** Aviso verde sobre el ticket: venta cobrada, pausada o retomada. */
  protected readonly aviso = signal<string | null>(null);
  protected readonly modalAbierto = computed(() => this.modal() !== null || !this.caja.abierta());
  /** Venta cuyo ticket no se pudo imprimir (C2.15). */
  protected readonly ticketFallido = signal<VentaCobrada | null>(null);
  protected readonly intentosImpresion = signal(1);

  constructor() {
    // Al reconectar se suben las ventas guardadas sin conexión (C2.16).
    effect(() => {
      const subidas = this.dispositivos.sincronizadas();
      if (!subidas) return;
      untracked(() => {
        this.aviso.set(`Conexión restablecida · ${subidas} ${subidas === 1 ? 'venta sincronizada' : 'ventas sincronizadas'}`);
        this.dispositivos.sincronizadas.set(0);
      });
    }, { allowSignalWrites: true });
  }

  abrir(modal: Modal): void {
    // Cliente, descuento, pausar y cobrar solo tienen sentido con artículos en el ticket.
    if (['descuento', 'pausar', 'cobro', 'cancelar'].includes(modal) && this.venta.vacia()) return;
    // Sin conexión no se buscan clientes (C2.16).
    if (modal === 'cliente' && !this.dispositivos.enLinea()) return;
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
    this.dispositivos.registrarVenta(cobrada);
    this.historial.registrar(cobrada, this.auth.sesion()?.nombre ?? '');
    this.aviso.set(this.mensajeCobro(cobrada));
    if (cobrada.imprimir && !this.documentos.venta(cobrada.folio)) {
      this.mostrarErrorImpresion(cobrada);
      return;
    }
    this.cerrarModal();
  }

  private mensajeCobro(cobrada: VentaCobrada): string {
    const cambio = cobrada.cambio > 0 ? `entrega ${formatearDinero(cobrada.cambio)} de cambio` : '';
    const metodos =
      cobrada.metodo === 'mixto'
        ? `pagada con ${[...new Set(cobrada.partes!.map((p) => NOMBRE_METODO[p.metodo]))].join(' y ')}`
        : cobrada.metodo === 'tarjeta'
          ? 'pagada con tarjeta'
          : cobrada.metodo === 'transferencia'
            ? 'pagada por transferencia'
            : '';
    const partes = [`Venta ${cobrada.folio} cobrada`, formatearDinero(cobrada.total), metodos, cambio];
    if (cobrada.facturada) partes.push('factura enviada por correo');
    if (!this.dispositivos.enLinea()) partes.push('se sincroniza al reconectar');
    return partes.filter(Boolean).join(' · ');
  }

  // ---------- C2.15 · Impresora ----------
  private mostrarErrorImpresion(venta: VentaCobrada): void {
    this.ticketFallido.set(venta);
    this.intentosImpresion.set(1);
    this.modal.set('impresora');
  }

  reintentarImpresion(): void {
    const venta = this.ticketFallido();
    if (!venta) return;
    if (this.documentos.venta(venta.folio)) {
      this.aviso.set(`Ticket de la venta ${venta.folio} impreso`);
      this.cerrarModal();
    } else {
      this.intentosImpresion.update((n) => n + 1);
    }
  }

  enviarTicketPorCorreo(): void {
    const venta = this.ticketFallido();
    if (!venta) return;
    this.aviso.set(`Ticket de la venta ${venta.folio} enviado a ${venta.cliente.correo}`);
    this.cerrarModal();
  }

  /** Ctrl+P: reimprime el último ticket del turno. */
  reimprimir(): void {
    const venta = this.dispositivos.ultimoTicket();
    if (!venta) {
      this.aviso.set('Todavía no hay un ticket para reimprimir en este turno');
      return;
    }
    if (this.documentos.venta(venta.folio)) this.aviso.set(`Ticket de la venta ${venta.folio} reimpreso`);
    else this.mostrarErrorImpresion(venta);
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
    // Ctrl+P siempre se intercepta para que no salga el diálogo de impresión del navegador.
    const reimpresion = (evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'p';
    if (reimpresion) evento.preventDefault();
    if (this.modalAbierto()) return;
    if (reimpresion) return this.reimprimir();
    const objetivo = (evento.target as HTMLElement).tagName;
    const escribiendo = ['INPUT', 'SELECT', 'TEXTAREA'].includes(objetivo);
    if (evento.key === '?' && !escribiendo) {
      evento.preventDefault();
      return this.abrir('atajos');
    }
    const teclas: Record<string, () => void> = {
      F1: () => this.barra().enfocar(),
      F2: () => this.barra().enfocar(),
      F3: () => this.router.navigateByUrl('/cajera/nueva-orden'),
      F5: () => this.router.navigateByUrl('/cajera/ventas'),
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
