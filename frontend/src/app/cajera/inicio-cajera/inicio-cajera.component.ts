import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import {
  formatearDinero,
  formatearDuracion,
  formatearFechaLarga,
  formatearHora,
  saludoDelDia,
} from '../../compartido/formato';
import { AbrirTurnoComponent } from '../abrir-turno/abrir-turno.component';
import { CajaService } from '../caja.service';
import { CorteService } from '../corte/corte.service';
import { InventarioService } from '../inventario/inventario.service';
import { OrdenesService, POR_ASIGNAR } from '../ordenes/ordenes.service';
import { VentaService } from '../punto-de-venta/venta.service';
import { HistorialVentasService } from '../ventas/historial-ventas.service';
import { ACCESOS, Indicador, Panel } from './inicio-cajera.datos';
import { panelAvisos, panelBodega, panelEnEspera, panelListos, panelStockBajo, panelUltimoCorte, panelVentas } from './inicio-cajera.paneles';

/** C1.1 Inicio · turno abierto / C1.2 Inicio · caja cerrada. */
@Component({
  selector: 'app-inicio-cajera',
  standalone: true,
  imports: [RouterLink, AbrirTurnoComponent],
  templateUrl: './inicio-cajera.component.html',
  styleUrl: './inicio-cajera.component.css',
})
export class InicioCajeraComponent {
  private readonly caja = inject(CajaService);
  private readonly router = inject(Router);
  private readonly sesion = inject(AuthService).sesion;
  private readonly corte = inject(CorteService);
  private readonly ordenes = inject(OrdenesService).ordenes;
  private readonly ventas = inject(HistorialVentasService).ventas;
  private readonly pausadas = inject(VentaService).pausadas;
  private readonly inventario = inject(InventarioService);

  protected readonly turno = this.caja.turno;
  protected readonly abrirTurno = signal(false);
  protected readonly accesos = ACCESOS;

  /** Se actualiza cada 30 s para el contador "4 h 42 min". */
  private readonly ahora = signal(new Date());

  protected readonly saludo = computed(
    () => `${saludoDelDia(this.ahora())}, ${this.sesion()?.nombre.split(' ')[0] ?? ''}`,
  );

  /** C1.1: "Viernes 16 oct 2026 · Caja 01 · SHURI" · C1.2 añade la hora: "… · 08:55 · Caja 01 · SHURI". */
  protected readonly subtitulo = computed(() => {
    const turno = this.turno();
    const fecha = formatearFechaLarga(this.ahora());
    return turno
      ? `${fecha} · ${turno.caja} · SHURI`
      : `${fecha} · ${formatearHora(this.ahora())} · ${this.caja.cajas[0]} · SHURI`;
  });

  protected readonly estadoTurno = computed(() => {
    const turno = this.turno();
    if (!turno) return '';
    const desde = new Date(turno.desde);
    return `Turno abierto desde ${formatearHora(desde)} · ${formatearDuracion(desde, this.ahora())}`;
  });

  /** Indicadores con los datos del turno: ventas, efectivo del arqueo (C10), entregas y órdenes de hoy. */
  protected readonly indicadores = computed<Indicador[]>(() => {
    const turno = this.turno();
    const hoy = new Date().toDateString();
    const ordenes = this.ordenes();
    const listos = ordenes.filter((o) => o.estado === 'lista' || o.estado === 'garantia-lista').length;
    const recibidas = ordenes.filter((o) => new Date(o.recibido).toDateString() === hoy);
    const porAsignar = recibidas.filter((o) => o.tecnico === POR_ASIGNAR).length;
    const recibidasHoy: Indicador = {
      valor: `${recibidas.length}`,
      titulo: 'Órdenes recibidas',
      detalle: porAsignar ? `Hoy · ${porAsignar} por asignar` : 'Hoy',
      conteo: true,
      tono: recibidas.length ? undefined : 'tenue',
    };
    if (!turno) {
      return [
        { valor: '$0.00', titulo: 'Vendido hoy', detalle: 'Sin turno abierto', tono: 'tenue' },
        { valor: formatearDinero(this.caja.fondoAsignado, true), titulo: 'Fondo asignado', detalle: 'Por contar al abrir' },
        { valor: `${listos}`, titulo: 'Listos para entregar', detalle: 'Se entregan con caja abierta', conteo: true, tono: 'exito' },
        recibidasHoy,
      ];
    }
    const r = this.corte.resumen();
    const entregasHoy = ordenes.filter((o) => o.entrega && new Date(o.entrega.fecha).toDateString() === hoy).length;
    const enEspera = this.pausadas().length;
    return [
      { valor: formatearDinero(r.ventas, true), titulo: 'Vendido en el turno', detalle: `${r.numVentas} ${r.numVentas === 1 ? 'venta' : 'ventas'} · ${enEspera} en espera` },
      { valor: formatearDinero(r.esperado, true), titulo: 'Efectivo en caja', detalle: `Fondo ${formatearDinero(turno.fondo, true)} incluido` },
      { valor: `${entregasHoy}`, titulo: 'Entregas hoy', detalle: `${listos} ${listos === 1 ? 'listo' : 'listos'} sin recoger`, conteo: true, tono: 'exito' },
      recibidasHoy,
    ];
  });

  /** Tres columnas de dos paneles; con la caja cerrada "Ventas en espera" cambia por "Último corte". */
  protected readonly columnas = computed<Panel[][]>(() => {
    const ordenes = this.ordenes();
    const productos = this.inventario.productos();
    const pedidos = this.inventario.pedidos();
    const turno = this.turno();
    return [
      [panelListos(ordenes), panelBodega(ordenes)],
      [panelVentas(this.ventas(), turno?.desde ?? null), panelStockBajo(productos, pedidos)],
      [turno ? panelEnEspera(this.pausadas()) : panelUltimoCorte(this.corte.cortes(), this.caja.cajas[0]), panelAvisos(productos, pedidos)],
    ];
  });

  constructor() {
    const reloj = setInterval(() => this.ahora.set(new Date()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }

  /** Atajos de Figma: F1 nueva venta · F3 nueva orden · F4 entregar equipo · F5 buscar folio. */
  @HostListener('window:keydown', ['$event'])
  protected alPresionarTecla(evento: KeyboardEvent): void {
    if (this.abrirTurno()) return;
    const acceso = this.accesos.find((a) => a.tecla === evento.key);
    if (!acceso) return;
    evento.preventDefault();
    if (acceso.requiereCaja && !this.turno()) this.abrirTurno.set(true);
    else this.router.navigate(['/cajera', acceso.ruta]);
  }
}
