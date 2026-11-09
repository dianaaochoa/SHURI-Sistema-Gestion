import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { FORMAS_PAGO, Pedido } from '../../cajera/inventario/inventario.datos';
import { InventarioService } from '../../cajera/inventario/inventario.service';
import { formatearDinero } from '../../compartido/formato';
import { diaMes } from '../por-cotizar/existencia';
import { NuevoPedidoComponent } from './nuevo-pedido/nuevo-pedido.component';
import { PedirSolicitudComponent } from './pedir-solicitud/pedir-solicitud.component';
import { RecibirDevolucionComponent } from './recibir-devolucion/recibir-devolucion.component';
import { Devolucion, ESTADOS_PIEZA, RefaccionesService, Solicitud } from './refacciones.service';
import { VerPedidoComponent } from './ver-pedido/ver-pedido.component';

type Vista = 'solicitudes' | 'pedidos' | 'devoluciones' | 'historial';

interface FilaPedido {
  folio: string;
  proveedor: string;
  piezas: string;
  ordenes: string;
  pago: string;
  llega: string;
  estado: { texto: string; tono: string };
  accion: 'Ver' | 'Reclamar';
  pedido: Pedido;
}

const PASOS = [
  { titulo: 'Tú haces el pedido', detalle: 'Folio PED, proveedor, costo y forma de pago' },
  { titulo: 'Caja recibe', detalle: 'Entrada de mercancía contra el pedido (C7.5)' },
  { titulo: 'Caja paga', detalle: 'Si es en efectivo: “Pago a proveedor” en el corte' },
  { titulo: 'Se aparta solo', detalle: 'La pieza queda apartada para la orden y avisa al técnico' },
];

/** J5 · Refacciones: J5.1 solicitudes · J5.2 pedir · J5.3 devolución · J5.4 pedidos · J5.5 nuevo pedido. */
@Component({
  selector: 'app-refacciones',
  standalone: true,
  imports: [PedirSolicitudComponent, RecibirDevolucionComponent, NuevoPedidoComponent, VerPedidoComponent],
  templateUrl: './refacciones.component.html',
  styleUrls: ['../lista-pagina.css', './refacciones.component.css'],
})
export class RefaccionesComponent implements OnInit {
  protected readonly servicio = inject(RefaccionesService);
  private readonly inventario = inject(InventarioService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly jefe = inject(AuthService).sesion()?.nombre ?? '';

  protected readonly vista = signal<Vista>('solicitudes');
  protected readonly aviso = signal<string | null>(null);
  protected readonly pasos = PASOS;
  protected readonly estadosPieza = ESTADOS_PIEZA;

  // ---------- Modales ----------
  protected readonly pidiendo = signal<Solicitud | null>(null);
  protected readonly recibiendo = signal<Devolucion | null>(null);
  protected readonly nuevoPedido = signal(false);
  protected readonly viendo = signal<FilaPedido | null>(null);

  // ---------- Solicitudes (J5.1) ----------
  private readonly porEntregar = computed(() => this.servicio.pendientes().filter((s) => !s.siAprueba && this.servicio.enStock(s) >= s.cantidad));
  private readonly porPedir = computed(() => this.servicio.pendientes().filter((s) => !this.porEntregar().includes(s)));

  protected readonly filasSolicitud = computed(() => [
    ...this.servicio.pendientes().map((s) => {
      const hay = this.servicio.enStock(s);
      const conStock = !s.siAprueba && hay >= s.cantidad;
      return {
        tipo: 'solicitud' as const,
        id: s.id,
        orden: s.orden,
        tecnico: corto(s.tecnico),
        pieza: `${s.nombre}${s.siAprueba ? ' · re-cotización' : ` · ${s.sku}`}`,
        cantidad: s.cantidad,
        stock: conStock ? { texto: `${hay} en stock`, tono: 'exito' } : { texto: 'Sin stock', tono: 'peligro' },
        urgencia: s.urgencia === 'hoy' ? { texto: 'Hoy', tono: 'advertencia' } : { texto: 'Normal', tono: 'neutro' },
        solicitud: s,
        devolucion: null,
        conStock,
      };
    }),
    ...this.servicio.devolucionesPendientes().map((d) => ({
      tipo: 'devolucion' as const,
      id: d.id,
      orden: d.orden,
      tecnico: corto(d.tecnico),
      pieza: `${d.nombre} · devolución`,
      cantidad: d.cantidad,
      stock: { texto: ESTADOS_PIEZA[d.segunTecnico].texto, tono: 'info' },
      urgencia: { texto: '—', tono: 'neutro' },
      solicitud: null,
      devolucion: d,
      conStock: false,
    })),
  ]);

  // ---------- Pedidos a proveedor (J5.4) ----------
  protected readonly filasPedido = computed<FilaPedido[]>(() => {
    const nombre = (sku: string) => this.inventario.buscar(sku)?.nombre ?? sku;
    const fila = (p: Pedido, estado: FilaPedido['estado'], accion: FilaPedido['accion']): FilaPedido => ({
      folio: p.folio,
      proveedor: p.proveedor,
      piezas: p.lineas.map((l) => `${nombre(l.sku)} ×${l.cantidad}`).join(' · '),
      ordenes: [...new Set(p.lineas.map((l) => l.orden).filter(Boolean))].join(', ') || '—',
      pago: p.pago === 'efectivo' ? 'Efectivo al recibir' : FORMAS_PAGO[p.pago].corto,
      llega: esHoy(p.llega) ? 'Hoy' : diaMes(p.llega),
      estado,
      accion,
      pedido: p,
    });
    const pendientes = [...this.inventario.pedidos()]
      .sort((a, b) => b.folio.localeCompare(a.folio))
      .map((p) => {
        const llega = new Date(p.llega);
        const estado = esHoy(p.llega) ? { texto: 'En camino', tono: 'advertencia' } : llega < new Date() ? { texto: 'Atrasado', tono: 'peligro' } : { texto: 'Pedido', tono: 'neutro' };
        return fila(p, estado, 'Ver');
      });
    const recibidos = this.inventario
      .entradas()
      .filter((e) => e.pedido)
      .map((e) => {
        const p: Pedido = { folio: e.pedido!, proveedor: e.proveedor, pago: e.pago, llega: e.fecha, jefe: '', lineas: e.lineas.map((l) => ({ sku: l.sku, cantidad: l.cantidad, costo: l.costo, orden: l.orden })), nota: e.nota };
        const parcial = !!e.faltan && !this.servicio.reclamados().includes(e.pedido!);
        const estado = e.faltan ? (parcial ? { texto: 'Recibido parcial', tono: 'peligro' } : { texto: 'Reclamado', tono: 'neutro' }) : { texto: 'Recibido', tono: 'exito' };
        return fila(p, estado, parcial ? 'Reclamar' : 'Ver');
      });
    return [...pendientes, ...recibidos];
  });

  private readonly parciales = computed(() =>
    this.inventario.entradas().filter((e) => e.pedido && e.faltan && !this.servicio.reclamados().includes(e.pedido)),
  );

  /** Lo pagado este mes a proveedores: entradas de contado (efectivo o transferencia). */
  private readonly pagadoMes = computed(() => {
    const hoy = new Date();
    return this.inventario
      .entradas()
      .filter((e) => e.pago !== 'credito' && new Date(e.fecha).getMonth() === hoy.getMonth() && new Date(e.fecha).getFullYear() === hoy.getFullYear())
      .reduce((s, e) => s + e.total, 0);
  });

  protected readonly indicadores = computed(() => {
    if (this.vista() === 'pedidos') {
      const faltan = this.parciales().reduce((s, e) => s + (e.faltan ?? 0), 0);
      const proveedores = new Set([...this.inventario.pedidos().map((p) => p.proveedor), ...this.inventario.entradas().filter((e) => e.pedido).map((e) => e.proveedor)]);
      return [
        { vista: 'pedidos' as Vista, valor: `${this.inventario.pedidos().length}`, tono: 'advertencia', titulo: 'Por recibir', detalle: 'Caja los verá al llegar' },
        { vista: 'pedidos' as Vista, valor: `${this.parciales().length}`, tono: 'peligro', titulo: 'Recibido parcial', detalle: faltan ? `Falta${faltan === 1 ? '' : 'n'} ${faltan} ${faltan === 1 ? 'pieza' : 'piezas'}` : 'Nada pendiente' },
        { vista: 'pedidos' as Vista, valor: formatearDinero(this.pagadoMes(), true), tono: '', titulo: 'Pagado este mes', detalle: 'A proveedores' },
        { vista: 'pedidos' as Vista, valor: `${proveedores.size}`, tono: 'primario', titulo: 'Proveedores', detalle: 'Activos' },
      ];
    }
    return [
      { vista: 'solicitudes' as Vista, valor: `${this.porEntregar().length}`, tono: 'primario', titulo: 'Por entregar', detalle: 'Hay stock' },
      { vista: 'solicitudes' as Vista, valor: `${this.porPedir().length}`, tono: 'peligro', titulo: 'Por pedir', detalle: 'Sin stock' },
      { vista: 'pedidos' as Vista, valor: `${this.inventario.pedidos().length}`, tono: 'advertencia', titulo: 'En camino', detalle: 'Pedido a proveedor' },
      { vista: 'devoluciones' as Vista, valor: `${this.servicio.devolucionesPendientes().length}`, tono: '', titulo: 'Devolución', detalle: 'Por recibir' },
    ];
  });

  protected readonly pestanas = computed(() => [
    { id: 'solicitudes' as Vista, texto: `Solicitudes (${this.filasSolicitud().length})` },
    { id: 'pedidos' as Vista, texto: `Pedidos a proveedor (${this.filasPedido().length})` },
    { id: 'devoluciones' as Vista, texto: `Devoluciones (${this.servicio.devolucionesPendientes().length})` },
    { id: 'historial' as Vista, texto: 'Historial' },
  ]);

  protected readonly subtitulo = computed(() =>
    this.vista() === 'pedidos'
      ? 'Pedidos que hiciste a proveedores. Caja los recibe en el mostrador y paga si es contra entrega.'
      : 'Aprueba, entrega o pide a proveedor las piezas que solicitan los técnicos.',
  );

  protected readonly devoluciones = computed(() =>
    [...this.servicio.devoluciones()].sort((a, b) => Number(!!a.recibida) - Number(!!b.recibida) || b.fecha.localeCompare(a.fecha)),
  );

  protected readonly historial = computed(() => this.servicio.historial().map((e) => ({ ...e, cuando: cuando(e.fecha) })));

  ngOnInit(): void {
    this.ruta.queryParamMap.subscribe((q) => {
      const vista = q.get('vista') as Vista | null;
      this.vista.set(vista && ['solicitudes', 'pedidos', 'devoluciones', 'historial'].includes(vista) ? vista : 'solicitudes');
      // Desde el Inicio (J1) o una orden: ?folio=1040 abre el pedido de su solicitud sin stock.
      const folio = q.get('folio');
      const s = folio ? this.servicio.pendientes().find((x) => x.orden === `#${folio}`) : null;
      if (s && this.servicio.enStock(s) < s.cantidad) this.pidiendo.set(s);
    });
  }

  protected elegir(vista: Vista): void {
    this.aviso.set(null);
    this.router.navigate([], { queryParams: { vista: vista === 'solicitudes' ? null : vista } });
  }

  // ---------- Acciones ----------
  protected entregar(s: Solicitud): void {
    this.servicio.entregar(s.id, this.jefe);
    this.aviso.set(`${s.id} · ${s.nombre} entregada a ${s.tecnico}: se descontó del inventario y se cargó a ${s.orden}`);
  }

  protected rechazar(s: Solicitud): void {
    this.servicio.rechazar(s.id, this.jefe);
    this.aviso.set(`${s.id} rechazada · ${s.tecnico.split(' ')[0]} recibe el aviso en su banco`);
  }

  protected terminado(mensaje: string): void {
    this.pidiendo.set(null);
    this.recibiendo.set(null);
    this.nuevoPedido.set(false);
    this.router.navigate([], { queryParams: { vista: this.vista() === 'solicitudes' ? null : this.vista() } });
    this.aviso.set(mensaje);
  }

  protected accionPedido(f: FilaPedido): void {
    if (f.accion === 'Reclamar') {
      this.servicio.reclamar(f.folio, this.jefe);
      this.aviso.set(`${f.folio}: faltante reclamado a ${f.proveedor}`);
    } else this.viendo.set(f);
  }
}

const corto = (nombre: string) => {
  const [n, a] = nombre.split(' ');
  return a ? `${n} ${a[0]}.` : n;
};
const esHoy = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
const cuando = (iso: string) => `${esHoy(iso) ? 'Hoy' : diaMes(iso)} ${new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
