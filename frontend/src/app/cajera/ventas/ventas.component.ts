import { Component, ElementRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { formatearDinero } from '../../compartido/formato';
import { CajaService } from '../caja.service';
import { DispositivosService } from '../punto-de-venta/dispositivos.service';
import { DetalleVentaComponent, fechaVenta } from './detalle-venta/detalle-venta.component';
import { DevolucionComponent } from './devolucion/devolucion.component';
import { DocumentosService } from '../documentos/documentos.service';
import { OrdenesService } from '../ordenes/ordenes.service';
import { IVA, MetodoPago, redondear } from '../punto-de-venta/venta.service';
import {
  Devolucion,
  ESTADOS,
  EstadoVenta,
  HistorialVentasService,
  METODOS,
  VentaRegistrada,
  articulosDe,
  reembolsado,
} from './historial-ventas.service';

type Periodo = 'turno' | 'hoy' | 'semana' | 'mes' | 'rango' | 'anio';

const PERIODOS: { id: Periodo; texto: string }[] = [
  { id: 'turno', texto: 'Turno actual' },
  { id: 'hoy', texto: 'Hoy' },
  { id: 'semana', texto: 'Semana' },
  { id: 'mes', texto: 'Mes' },
  { id: 'rango', texto: 'Rango' },
];

const FORMAS_REEMBOLSO = { efectivo: 'en efectivo', tarjeta: 'a la tarjeta', nota: 'en nota de crédito', cambio: 'para cambio por otro producto' };

const sinAcentos = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const inicioDelDia = (fecha: Date) => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
const finDelDia = (fecha: Date) => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 23, 59, 59, 999);
const aCampo = (fecha: Date) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
const deCampo = (texto: string) => {
  const [a, m, d] = texto.split('-').map(Number);
  return new Date(a, m - 1, d);
};
const mesCorto = (fecha: Date) => fecha.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');

/** C3 · Ventas: C3.1 historial con detalle · C3.2 sin resultados · C3.3 devolución. */
@Component({
  selector: 'app-ventas',
  standalone: true,
  imports: [FormsModule, DetalleVentaComponent, DevolucionComponent],
  templateUrl: './ventas.component.html',
  styleUrl: './ventas.component.css',
})
export class VentasComponent {
  private readonly historial = inject(HistorialVentasService);
  private readonly caja = inject(CajaService);
  private readonly dispositivos = inject(DispositivosService);
  private readonly documentos = inject(DocumentosService);
  private readonly router = inject(Router);
  private readonly ordenes = inject(OrdenesService);
  private readonly tabla = viewChild<ElementRef<HTMLElement>>('tabla');

  protected readonly periodos = PERIODOS;
  protected readonly cajeras = this.historial.cajeras;
  protected readonly metodos = Object.entries(METODOS);
  protected readonly nombresMetodo = METODOS;
  protected readonly estados = ESTADOS;
  protected readonly listaEstados = Object.entries(ESTADOS) as [EstadoVenta, { texto: string }][];
  protected readonly dinero = formatearDinero;
  protected readonly fecha = fechaVenta;
  protected readonly articulos = articulosDe;

  // ---------- Periodo ----------
  protected readonly periodo = signal<Periodo>('mes');
  protected readonly eligiendoRango = signal(false);
  protected readonly desde = signal(aCampo(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  protected readonly hasta = signal(aCampo(new Date()));

  protected readonly rango = computed(() => {
    const hoy = new Date();
    switch (this.periodo()) {
      case 'turno': {
        const turno = this.caja.turno();
        return { desde: turno ? new Date(turno.desde) : inicioDelDia(hoy), hasta: finDelDia(hoy) };
      }
      case 'hoy':
        return { desde: inicioDelDia(hoy), hasta: finDelDia(hoy) };
      case 'semana': {
        const lunes = inicioDelDia(hoy);
        lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
        return { desde: lunes, hasta: finDelDia(hoy) };
      }
      case 'mes':
        return { desde: new Date(hoy.getFullYear(), hoy.getMonth(), 1), hasta: finDelDia(hoy) };
      case 'anio':
        return { desde: new Date(hoy.getFullYear(), 0, 1), hasta: finDelDia(hoy) };
      case 'rango': {
        const a = deCampo(this.desde());
        const b = deCampo(this.hasta());
        return a <= b ? { desde: a, hasta: finDelDia(b) } : { desde: inicioDelDia(b), hasta: finDelDia(a) };
      }
    }
  });

  /** "1 oct – 13 oct 2026" */
  protected readonly textoRango = computed(() => {
    const { desde, hasta } = this.rango();
    const anio = desde.getFullYear() === hasta.getFullYear() ? '' : ` ${desde.getFullYear()}`;
    return `${desde.getDate()} ${mesCorto(desde)}${anio} – ${hasta.getDate()} ${mesCorto(hasta)} ${hasta.getFullYear()}`;
  });

  /** Para los indicadores ("Octubre") y el mensaje sin resultados ("en octubre"). */
  protected readonly nombrePeriodo = computed(() => {
    const mes = this.rango().desde.toLocaleDateString('es-MX', { month: 'long' });
    return {
      turno: ['Turno actual', 'en este turno'],
      hoy: ['Hoy', 'hoy'],
      semana: ['Esta semana', 'esta semana'],
      mes: [mes[0].toUpperCase() + mes.slice(1), `en ${mes}`],
      anio: [`${new Date().getFullYear()}`, `en ${new Date().getFullYear()}`],
      rango: ['En el rango', 'en ese rango'],
    }[this.periodo()];
  });

  // ---------- Filtros ----------
  protected readonly busqueda = signal('');
  protected cajera = '';
  protected metodo = '';
  protected estado = '';
  /** Cambia con cada filtro de select para recalcular (los selects usan ngModel). */
  private readonly filtros = signal(0);

  /**
   * Cobros de la entrega de reparaciones (C6): entran a la caja y al corte, y aquí se ven junto a las ventas.
   * Son de solo lectura: se ajustan desde la orden.
   */
  private readonly cobrosDeEntrega = computed<VentaRegistrada[]>(() =>
    this.ordenes
      .ordenes()
      // Las entregas de prueba solo traen lo pagado en total: lo cobrado al entregar es eso menos el anticipo.
      .map((o) => ({ o, total: o.entrega ? (o.entrega.cobrado ?? redondear(o.entrega.pagado - o.anticipo)) : 0 }))
      .filter(({ total }) => total > 0)
      .map(({ o, total }) => {
        const subtotal = redondear(total / (1 + IVA));
        return {
          folio: o.folio,
          fecha: o.entrega!.fecha,
          cliente: { id: `orden-${o.folio}`, nombre: o.cliente.nombre, telefono: o.cliente.telefono, correo: o.cliente.correo },
          cajera: o.entrega!.por.split(' · ')[0],
          lineas: [{ sku: o.folio, nombre: `Reparación · ${o.equipo}`, precio: subtotal, cantidad: 1, descuento: 0, disponibles: null }],
          descuento: null,
          subtotal,
          iva: redondear(total - subtotal),
          total,
          metodo: ((o.entrega!.metodo ?? 'efectivo').toLowerCase() as MetodoPago),
          recibido: total,
          cambio: 0,
          estado: 'pagada' as const,
          devoluciones: [],
          orden: o.folio,
        };
      }),
  );

  private readonly enPeriodo = computed(() => {
    const { desde, hasta } = this.rango();
    return [...this.historial.ventas(), ...this.cobrosDeEntrega()]
      .filter((v) => {
        const fecha = new Date(v.fecha);
        return fecha >= desde && fecha <= hasta;
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  });

  protected readonly filtradas = computed(() => {
    this.filtros();
    const texto = sinAcentos(this.busqueda().trim());
    return this.enPeriodo().filter(
      (v) =>
        (!this.cajera || v.cajera === this.cajera) &&
        (!this.metodo || v.metodo === this.metodo) &&
        (!this.estado || v.estado === this.estado) &&
        (!texto ||
          sinAcentos(v.folio).includes(texto) ||
          sinAcentos(v.cliente.nombre).includes(texto) ||
          v.lineas.some((l) => sinAcentos(l.nombre).includes(texto) || sinAcentos(l.sku).includes(texto))),
    );
  });

  protected readonly hayFiltros = computed(() => {
    this.filtros();
    return !!(this.busqueda().trim() || this.cajera || this.metodo || this.estado);
  });

  // ---------- Indicadores (del periodo) ----------
  protected readonly indicadores = computed(() => {
    const ventas = this.enPeriodo();
    const cobradas = ventas.filter((v) => v.estado !== 'cancelada');
    const total = cobradas.reduce((suma, v) => suma + v.total, 0);
    const devoluciones = ventas.reduce((suma, v) => suma + v.devoluciones.length, 0);
    const reembolsos = ventas.reduce((suma, v) => suma + reembolsado(v), 0);
    return {
      cobradas: cobradas.length,
      promedio: cobradas.length ? total / cobradas.length : 0,
      total,
      devoluciones,
      reembolsos,
      canceladas: ventas.length - cobradas.length,
    };
  });

  // ---------- Selección y acciones ----------
  private readonly folioElegido = signal<string | null>(null);
  protected readonly seleccionada = computed(() => {
    const lista = this.filtradas();
    return lista.find((v) => v.folio === this.folioElegido()) ?? lista[0] ?? null;
  });

  protected readonly modal = signal<'devolucion' | 'cancelar' | null>(null);
  protected readonly aviso = signal<string | null>(null);

  elegirPeriodo(periodo: Periodo): void {
    this.periodo.set(periodo);
    this.eligiendoRango.set(periodo === 'rango');
  }

  filtrar(): void {
    this.filtros.update((n) => n + 1);
  }

  limpiarFiltros(): void {
    this.busqueda.set('');
    this.cajera = this.metodo = this.estado = '';
    this.filtrar();
  }

  /** C3.2 "Ver todo el año" */
  verTodoElAnio(): void {
    this.elegirPeriodo('anio');
  }

  elegir(venta: VentaRegistrada): void {
    this.folioElegido.set(venta.folio);
  }

  /** ↑/↓ en la tabla mueven la selección. */
  moverSeleccion(evento: Event, paso: number): void {
    evento.preventDefault();
    const lista = this.filtradas();
    const actual = lista.findIndex((v) => v.folio === this.seleccionada()?.folio);
    const siguiente = lista[Math.max(0, Math.min(lista.length - 1, actual + paso))];
    if (!siguiente) return;
    this.folioElegido.set(siguiente.folio);
    setTimeout(() => this.tabla()?.nativeElement.querySelector<HTMLElement>(`[data-folio="${siguiente.folio}"]`)?.focus());
  }

  reimprimir(venta: VentaRegistrada): void {
    this.aviso.set(
      (venta.orden ? this.documentos.orden(venta.orden, 'entrega') : this.documentos.venta(venta.folio))
        ? `Ticket ${venta.folio} reimpreso`
        : 'La impresora no responde: revisa que esté encendida, con papel y conectada',
    );
  }

  enviar(venta: VentaRegistrada): void {
    this.aviso.set(`Ticket ${venta.folio} enviado a ${venta.cliente.correo}`);
  }

  /** Esc cierra la confirmación de cancelar (el modal de devolución tiene el suyo) y el selector de rango. */
  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    if (this.modal() === 'cancelar') this.modal.set(null);
    this.eligiendoRango.set(false);
  }

  confirmarCancelacion(): void {
    const venta = this.seleccionada();
    if (!venta) return;
    this.historial.cancelar(venta.folio);
    this.aviso.set(`Venta ${venta.folio} cancelada · regresa ${formatearDinero(venta.total)} al cliente`);
    this.modal.set(null);
  }

  confirmarDevolucion(devolucion: Devolucion): void {
    const venta = this.seleccionada();
    if (!venta) return;
    this.historial.devolver(venta.folio, devolucion);
    const impreso = this.documentos.devolucion(venta.folio);
    // “Cambio por otro”: la devolución deja una nota y se sigue en Punto de venta con lo que se lleva.
    if (devolucion.forma === 'cambio') {
      const actualizada = this.historial.ventas().find((v) => v.folio === venta.folio)!;
      const nota = this.historial.folioNota(actualizada, actualizada.devoluciones.length - 1);
      this.modal.set(null);
      this.router.navigate(['/cajera/punto-de-venta'], { queryParams: { cliente: venta.cliente.id, nota } });
      return;
    }
    this.aviso.set(
      `Devolución de ${venta.folio} registrada · ${formatearDinero(devolucion.monto)} ${FORMAS_REEMBOLSO[devolucion.forma]}` +
        (impreso ? '' : ' · no se pudo imprimir el comprobante'),
    );
    this.modal.set(null);
  }
}
