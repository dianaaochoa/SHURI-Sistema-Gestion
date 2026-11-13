import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { formatearDinero, saludoDelDia } from '../../compartido/formato';
import { CajaService } from '../../cajera/caja.service';
import { CorteService, revisionDe } from '../../cajera/corte/corte.service';
import { claveDia } from '../../cajera/estadisticas/estadisticas.datos';
import { EstadisticasService } from '../../cajera/estadisticas/estadisticas.service';
import { InventarioService } from '../../cajera/inventario/inventario.service';
import { OrdenesService } from '../../cajera/ordenes/ordenes.service';
import { DESCUENTO_MAXIMO, calcularTotales } from '../../cajera/punto-de-venta/venta.service';
import { HistorialVentasService } from '../../cajera/ventas/historial-ventas.service';
import { atrasada } from '../../jefe/etapas';
import { EN_TALLER } from '../../jefe/tecnicos/carga';
import { DIAS_CREDITO_DEMO, META_GARANTIAS, masRentables, origenDinero, utilidadDe } from '../negocio';

type Periodo = 'hoy' | 'semana' | 'mes';

interface Aviso {
  icono: string;
  tono: string;
  titulo: string;
  detalle: string;
  accion: string;
  ruta: string;
}

const DIA = 86_400_000;
const dinero = (n: number) => formatearDinero(n, true);
const diaMes = (f: Date) => `${f.getDate()} ${f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;
const mesLargo = (f: Date) => f.toLocaleDateString('es-MX', { month: 'long' });

/** AD1.1 · Inicio del administrador (AD1.2 notificaciones y AD1.3 menú de usuario están en el menú lateral). */
@Component({
  selector: 'app-inicio-admin',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './inicio-admin.component.html',
  styleUrls: ['./inicio-admin.component.css'],
})
export class InicioAdminComponent {
  private readonly estadisticas = inject(EstadisticasService);
  private readonly inventario = inject(InventarioService);
  private readonly ordenes = inject(OrdenesService).ordenes;
  private readonly ventas = inject(HistorialVentasService).ventas;
  private readonly corte = inject(CorteService);
  private readonly caja = inject(CajaService);
  private readonly buscar = (sku: string) => this.inventario.buscar(sku);

  protected readonly periodo = signal<Periodo>('hoy');
  protected readonly periodos: { id: Periodo; texto: string }[] = [
    { id: 'hoy', texto: 'Hoy' },
    { id: 'semana', texto: 'Esta semana' },
    { id: 'mes', texto: 'Este mes' },
  ];

  private readonly hoy = (() => {
    const h = new Date();
    return new Date(h.getFullYear(), h.getMonth(), h.getDate());
  })();

  protected readonly saludo = `${saludoDelDia(new Date())}, ${(inject(AuthService).sesion()?.nombre ?? '').split(' ')[0]}`;
  protected readonly subtitulo = (() => {
    const dia = this.hoy.toLocaleDateString('es-MX', { weekday: 'long' });
    return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${this.hoy.getDate()} de ${mesLargo(this.hoy)} · Resumen del negocio`;
  })();
  protected readonly nombreMes = mesLargo(this.hoy);

  private readonly inicioMes = new Date(this.hoy.getFullYear(), this.hoy.getMonth(), 1);
  private readonly delMes = computed(() => this.estadisticas.suma(this.inicioMes, this.hoy));

  protected readonly indicadores = computed(() => {
    const p = this.periodo();
    const desde = p === 'hoy' ? this.hoy : p === 'semana' ? new Date(this.hoy.getTime() - ((this.hoy.getDay() + 6) % 7) * DIA) : this.inicioMes;
    const d = this.estadisticas.suma(desde, this.hoy);
    const u = utilidadDe(d, this.buscar);
    const nombre = p === 'hoy' ? 'hoy' : p === 'semana' ? 'de la semana' : 'del mes';
    const enTaller = this.ordenes().filter((o) => EN_TALLER.includes(o.estado));
    const atrasadas = enTaller.filter(atrasada).length;
    const abierta = this.caja.abierta();
    return [
      { valor: dinero(u.ingreso), tono: '', titulo: `Ingresos ${nombre}`, detalle: `Mostrador ${dinero(d.mostrador)} · Taller ${dinero(d.reparaciones)}` },
      { valor: dinero(u.utilidad), tono: 'exito', titulo: `Utilidad bruta ${nombre}`, detalle: `${u.margen}% de margen` },
      { valor: dinero(abierta ? this.corte.resumen().esperado : 0), tono: 'primario', titulo: 'Efectivo en caja', detalle: abierta ? 'Caja 01 · turno abierto' : 'Caja 01 · cerrada' },
      { valor: `${enTaller.length}`, tono: 'advertencia', titulo: 'Órdenes en taller', detalle: atrasadas ? `${atrasadas} ${atrasadas === 1 ? 'atrasada' : 'atrasadas'}` : 'Todas a tiempo' },
    ];
  });

  /** Ingresos de los últimos 14 días (miles de pesos); hoy va resaltado. */
  protected readonly dias = computed(() => {
    const lista = Array.from({ length: 14 }, (_, i) => {
      const f = new Date(this.hoy.getTime() - (13 - i) * DIA);
      const d = this.estadisticas.suma(f, f);
      return { etiqueta: i === 13 ? 'Hoy' : `${f.getDate()}`, total: d.mostrador + d.reparaciones, hoy: i === 13, clave: claveDia(f) };
    });
    const mayor = Math.max(1, ...lista.map((d) => d.total));
    return lista.map((d) => ({ ...d, alto: Math.max(4, Math.round((d.total / mayor) * 100)), miles: `$${(d.total / 1000).toFixed(1)} mil` }));
  });

  /** "Octubre a la fecha", "vs septiembre +12%" y ticket promedio. */
  protected readonly resumenMes = computed(() => {
    const actual = this.delMes();
    const antesDesde = new Date(this.hoy.getFullYear(), this.hoy.getMonth() - 1, 1);
    const finAntes = new Date(this.hoy.getFullYear(), this.hoy.getMonth(), 0);
    const antesHasta = new Date(antesDesde.getFullYear(), antesDesde.getMonth(), Math.min(this.hoy.getDate(), finAntes.getDate()));
    const antes = this.estadisticas.suma(antesDesde, antesHasta);
    const total = actual.mostrador + actual.reparaciones;
    const totalAntes = antes.mostrador + antes.reparaciones;
    const cambio = totalAntes ? Math.round(((total - totalAntes) / totalAntes) * 100) : null;
    return {
      total: dinero(total),
      contra: mesLargo(antesDesde),
      cambio: cambio === null ? '—' : `${cambio >= 0 ? '+' : '−'}${Math.abs(cambio)}%`,
      sube: (cambio ?? 0) >= 0,
      ticket: dinero(actual.ventas ? actual.mostrador / actual.ventas : 0),
    };
  });

  protected readonly origen = computed(() => origenDinero(this.delMes(), this.buscar));
  protected readonly rentables = computed(() => masRentables(this.delMes(), this.buscar));

  /** "Atención": lo que el administrador debe revisar hoy (Figma AD1.1). */
  protected readonly avisos = computed<Aviso[]>(() => {
    const avisos: Aviso[] = [];
    const semana = Date.now() - 7 * DIA;
    const faltante = this.corte
      .cortes()
      .filter((c) => c.contado < c.esperado && revisionDe(c).pendiente && new Date(c.hasta).getTime() >= semana)
      .sort((a, b) => b.hasta.localeCompare(a.hasta))[0];
    if (faltante)
      avisos.push({ icono: 'menu/receipt', tono: 'peligro', titulo: 'Corte con faltante sin revisar', detalle: `${diaMes(new Date(faltante.hasta))} ${faltante.turno.toLowerCase()} · −${formatearDinero(faltante.esperado - faltante.contado)} · ${faltante.cajera}`, accion: 'Revisar', ruta: 'cortes-de-caja' });

    const credito = this.inventario
      .entradas()
      .filter((e) => e.pago === 'credito')
      .map((e) => ({ e, vence: new Date(new Date(e.fecha).getTime() + DIAS_CREDITO_DEMO * DIA) }))
      .filter((x) => x.vence.getTime() >= this.hoy.getTime())
      .sort((a, b) => a.vence.getTime() - b.vence.getTime())[0];
    if (credito) {
      const dias = Math.ceil((credito.vence.getTime() - Date.now()) / DIA);
      avisos.push({ icono: 'menu/truck', tono: 'advertencia', titulo: 'Pago a proveedor por vencer', detalle: `${credito.e.proveedor} · ${formatearDinero(credito.e.total)} · vence ${diaMes(credito.vence)}`, accion: `${dias} ${dias === 1 ? 'día' : 'días'}`, ruta: 'proveedores' });
    }

    const productos = this.inventario.productos();
    const bajos = productos.filter((p) => !p.usoInterno && p.stock <= p.minimo);
    if (bajos.length) {
      const sinStock = bajos.filter((p) => p.stock === 0).length;
      const enCamino = bajos.filter((p) => this.inventario.llegada(p.sku)).length;
      avisos.push({ icono: 'menu/package', tono: 'info', titulo: `${bajos.length} ${bajos.length === 1 ? 'producto bajo' : 'productos bajo'} el mínimo`, detalle: `${sinStock} sin stock, ${enCamino} ya en camino`, accion: 'Ver', ruta: 'catalogo-y-precios' });
    }

    const conDescuento = this.ventas().filter((v) => v.estado !== 'cancelada' && new Date(v.fecha).getTime() >= this.hoy.getTime() && (v.descuento || v.lineas.some((l) => l.descuento)));
    if (conDescuento.length) {
      const monto = conDescuento.reduce((s, v) => s + calcularTotales(v.lineas, v.descuento).descuento * 1.16, 0);
      avisos.push({ icono: 'menu/history', tono: 'info', titulo: 'Descuentos del día', detalle: `${conDescuento.length} · ${dinero(monto)} · máximo permitido ${DESCUENTO_MAXIMO}%`, accion: 'Bitácora', ruta: 'bitacora' });
    }

    const enBodega = this.ordenes()
      .filter((o) => (o.estado === 'bodega' || o.estado === 'vencida') && o.listaDesde)
      .map((o) => ({ o, dias: Math.floor((Date.now() - new Date(o.listaDesde!).getTime()) / DIA) }))
      .sort((a, b) => b.dias - a.dias)[0];
    if (enBodega && enBodega.dias > 30)
      avisos.push({ icono: 'menu/warehouse', tono: 'advertencia', titulo: `Equipo ${enBodega.dias} días sin recoger`, detalle: `${enBodega.o.folio} · se aplica política de bodega`, accion: 'Taller', ruta: 'taller' });
    return avisos;
  });

  /** Garantías pedidas en 30 días entre equipos entregados en 30 días (como J4.1). */
  protected readonly garantias = computed(() => {
    const desde = new Date(this.hoy.getTime() - 29 * DIA);
    const entregados = this.estadisticas.suma(desde, this.hoy).entregados;
    const pedidas = this.ordenes().filter((o) => o.garantia && new Date(o.garantia.recibida).getTime() >= desde.getTime()).length;
    const tasa = entregados ? Math.round((pedidas / entregados) * 100) : 0;
    return { tasa, meta: META_GARANTIAS, alta: tasa >= META_GARANTIAS };
  });

  protected dinero(n: number): string {
    return dinero(n);
  }
}
