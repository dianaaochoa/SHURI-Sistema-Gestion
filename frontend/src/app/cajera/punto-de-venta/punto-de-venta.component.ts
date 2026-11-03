import { Component, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { formatearDinero } from '../../compartido/formato';
import { AbrirTurnoComponent } from '../abrir-turno/abrir-turno.component';
import { CajaService } from '../caja.service';
import { BarraBusquedaComponent } from './barra-busqueda/barra-busqueda.component';
import { VENTAS_EN_ESPERA_DEMO } from './catalogo.datos';
import { CobroComponent } from './cobro/cobro.component';
import { ProductoTemporalComponent } from './producto-temporal/producto-temporal.component';
import { TablaTicketComponent } from './tabla-ticket/tabla-ticket.component';
import { Pago, ProductoTemporal, VentaCobrada, VentaService } from './venta.service';

/** Atajos de la barra inferior (Figma C2.1). Los marcados `proximamente` llegan en las siguientes fases. */
const ATAJOS = [
  { tecla: 'F2', accion: 'Buscar' },
  { tecla: 'F4', accion: 'Cliente', proximamente: true },
  { tecla: 'F6', accion: 'Descuento', proximamente: true },
  { tecla: 'F7', accion: 'Producto temporal' },
  { tecla: 'F8', accion: 'Pausar', proximamente: true },
  { tecla: 'F9', accion: 'En espera', proximamente: true },
  { tecla: 'F12', accion: 'Cobrar' },
  { tecla: 'Esc', accion: 'Cancelar' },
];

/**
 * C2 · Punto de venta.
 * C2.1 venta activa · C2.2 carrito vacío · C2.3/C2.4 búsqueda (BarraBusqueda) ·
 * C2.7 producto temporal · C2.10–C2.12 cobro.
 */
@Component({
  selector: 'app-punto-de-venta',
  standalone: true,
  imports: [
    RouterLink,
    AbrirTurnoComponent,
    BarraBusquedaComponent,
    CobroComponent,
    ProductoTemporalComponent,
    TablaTicketComponent,
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
  protected readonly enEspera = VENTAS_EN_ESPERA_DEMO;
  protected readonly dinero = formatearDinero;

  protected readonly cobrando = signal(false);
  protected readonly confirmarCancelar = signal(false);
  protected readonly temporal = signal<{ nombre: string; precio: number | null } | null>(null);
  /** Aviso de la última venta cobrada. */
  protected readonly cobrada = signal<VentaCobrada | null>(null);
  protected readonly modalAbierto = computed(
    () => this.cobrando() || this.confirmarCancelar() || this.temporal() !== null || !this.caja.abierta(),
  );

  abrirTemporal(datos: { nombre: string; precio: number | null } = { nombre: '', precio: null }): void {
    this.temporal.set(datos);
  }

  agregarTemporal(datos: ProductoTemporal): void {
    this.venta.agregarTemporal(datos);
    this.temporal.set(null);
    this.cobrada.set(null);
    this.barra().enfocar();
  }

  cobrar(): void {
    if (this.venta.vacia()) return;
    this.barra().limpiar();
    this.cobrando.set(true);
  }

  confirmarCobro(pago: Pago): void {
    this.cobrada.set(this.venta.cobrar(pago));
    this.cobrando.set(false);
    this.barra().enfocar();
  }

  cancelarVenta(): void {
    this.venta.cancelar();
    this.confirmarCancelar.set(false);
    this.barra().enfocar();
  }

  /** Si la cajera cierra el modal de abrir turno sin abrirlo, vuelve al inicio: sin caja no se cobra. */
  alCerrarAbrirTurno(): void {
    if (!this.caja.abierta()) this.router.navigateByUrl('/cajera/inicio');
  }

  @HostListener('window:keydown', ['$event'])
  protected alPresionarTecla(evento: KeyboardEvent): void {
    if (this.modalAbierto()) return;
    const objetivo = (evento.target as HTMLElement).tagName;
    switch (evento.key) {
      case 'F2':
        evento.preventDefault();
        this.barra().enfocar();
        break;
      case 'F7':
        evento.preventDefault();
        this.abrirTemporal();
        break;
      case 'F12':
        evento.preventDefault();
        this.cobrar();
        break;
      case 'Enter':
        if (!['INPUT', 'BUTTON', 'A', 'SELECT'].includes(objetivo)) this.cobrar();
        break;
      case 'Escape':
        if (!this.venta.vacia()) this.confirmarCancelar.set(true);
        break;
    }
  }
}
