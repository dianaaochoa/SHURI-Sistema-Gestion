import { formatearDinero } from '../../compartido/formato';
import { NombreTurno } from '../caja.service';
import { Corte } from '../corte/corte.service';
import { ProductoInventario, Pedido } from '../inventario/inventario.datos';
import { apartadas, disponible, estadoStock } from '../inventario/inventario.service';
import { Orden, diasDesde, saldo } from '../ordenes/ordenes.service';
import { Linea, VentaPausada, calcularTotales } from '../punto-de-venta/venta.service';
import { VentaRegistrada } from '../ventas/historial-ventas.service';
import { Fila, Panel } from './inicio-cajera.datos';

/**
 * Paneles del inicio de la cajera (C1.1 / C1.2) con los datos de la app: órdenes, ventas, inventario y cortes.
 * Mismo formato que los de Figma (`inicio-cajera.datos.ts`).
 */

const hace = (iso: string): string => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
};

const METODO: Record<string, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', mixto: 'Mixto' };

/** "5 artículos", "Cargador USB-C 20W" o "Mica + funda". */
function resumenLineas(lineas: Linea[]): string {
  const piezas = lineas.reduce((s, l) => s + l.cantidad, 0);
  if (lineas.length === 1) return lineas[0].cantidad > 1 ? `${lineas[0].nombre} ×${lineas[0].cantidad}` : lineas[0].nombre;
  return lineas.length === 2 ? lineas.map((l) => l.nombre.split(' ')[0]).join(' + ') : `${piezas} artículos`;
}

export function panelListos(ordenes: Orden[]): Panel {
  const listos = ordenes
    .filter((o) => o.estado === 'lista' || o.estado === 'garantia-lista')
    .sort((a, b) => (a.listaDesde ?? a.recibido).localeCompare(b.listaDesde ?? b.recibido));
  return {
    tipo: 'lista',
    titulo: 'Listos para entregar',
    icono: 'titulo-package-check',
    insignia: { valor: listos.length, tono: 'exito' },
    filas: listos.slice(0, 3).map((o) => {
      const debe = saldo(o);
      return {
        titulo: `${o.folio} · ${o.equipo}`,
        detalle: `${o.cliente.nombre} · lista ${o.listaDesde ? hace(o.listaDesde) : ''}`.trim(),
        estado: { texto: debe > 0 ? `Saldo ${formatearDinero(debe, true)}` : 'Pagado', tono: 'neutro' },
        ruta: 'entrega-de-equipo',
      };
    }),
    enlace: { texto: 'Ir a Entrega de equipo', ruta: 'entrega-de-equipo' },
  };
}

export function panelBodega(ordenes: Orden[]): Panel {
  const vencidas = ordenes.filter((o) => o.estado === 'vencida').sort((a, b) => (a.listaDesde ?? '').localeCompare(b.listaDesde ?? ''));
  return {
    tipo: 'lista',
    titulo: 'Por enviar a bodega',
    icono: 'titulo-warehouse',
    insignia: { valor: vencidas.length, tono: 'peligro' },
    filas: vencidas.slice(0, 3).map((o) => ({
      titulo: `${o.folio} · ${o.equipo}`,
      detalle: `${o.cliente.nombre} · ${diasDesde(o.listaDesde ?? o.recibido)} días sin recoger`,
      ruta: 'ordenes-de-servicio',
    })),
    enlace: { texto: 'Revisar en Órdenes de servicio', ruta: 'ordenes-de-servicio' },
  };
}

/** Ventas del turno abierto o, con la caja cerrada, las más recientes. */
export function panelVentas(ventas: VentaRegistrada[], desde: string | null): Panel {
  const lista = ventas.filter((v) => v.estado !== 'cancelada' && (!desde || v.fecha >= desde)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return {
    tipo: 'lista',
    titulo: desde ? 'Ventas recientes del turno' : 'Ventas recientes',
    icono: 'titulo-call',
    insignia: { valor: lista.length, tono: 'advertencia' },
    filas: lista.slice(0, 2).map((v) => ({
      titulo: `${v.folio} · ${resumenLineas(v.lineas)}`,
      detalle: `${METODO[v.metodo] ?? v.metodo} · ${hace(v.fecha)}`,
      monto: formatearDinero(v.total, true),
      ruta: 'ventas',
    })),
    enlace: { texto: desde ? 'Ver ventas del turno' : 'Ver ventas', ruta: 'ventas' },
  };
}

export function panelStockBajo(productos: ProductoInventario[], pedidos: Pedido[]): Panel {
  const bajos = productos.filter((p) => p.stock > 0 && estadoStock(p) === 'bajo').sort((a, b) => a.stock - b.stock);
  const pedido = (sku: string) => pedidos.find((x) => x.lineas.some((l) => l.sku === sku));
  return {
    tipo: 'lista',
    titulo: 'Stock bajo',
    icono: 'titulo-receipt',
    insignia: { valor: bajos.length, tono: 'advertencia' },
    filas: bajos.slice(0, 2).map((p) => {
      const ped = pedido(p.sku);
      return {
        titulo: `${p.nombre} · quedan ${p.stock}`,
        detalle: `Mínimo ${p.minimo}${ped ? ` · el jefe ya tiene pedido ${ped.folio}` : ' · avísale al jefe'}`,
        ruta: 'inventario',
      };
    }),
    enlace: { texto: 'Ir a Inventario', ruta: 'inventario' },
  };
}

export function panelEnEspera(pausadas: VentaPausada[]): Panel {
  return {
    tipo: 'lista',
    titulo: 'Ventas en espera',
    icono: 'titulo-pause',
    insignia: { valor: pausadas.length, tono: 'info' },
    filas: pausadas.map((p) => ({
      titulo: `${p.folio} · ${p.cliente.nombre}`,
      detalle: `${formatearDinero(calcularTotales(p.lineas, p.descuento).total)} · pausada ${hace(p.pausadaEn)}`,
      ruta: 'punto-de-venta',
    })),
    enlace: { texto: 'Abrir punto de venta', ruta: 'punto-de-venta' },
  };
}

export function panelUltimoCorte(cortes: Corte[], caja: string): Panel {
  const c = [...cortes].filter((x) => x.caja === caja).sort((a, b) => b.hasta.localeCompare(a.hasta))[0];
  if (!c) return { tipo: 'corte', titulo: 'Último corte de esta caja', filas: [{ etiqueta: 'Corte', valor: 'Todavía no hay cortes' }] };
  const dif = Math.round((c.contado - c.esperado) * 100) / 100;
  const fecha = new Date(c.hasta);
  const dia = `${fecha.getDate()} ${fecha.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;
  return {
    tipo: 'corte',
    titulo: 'Último corte de esta caja',
    filas: [
      { etiqueta: 'Corte', valor: `${c.folio} · ${dia} · ${c.turno as NombreTurno}` },
      { etiqueta: 'Cajera', valor: c.cajera },
      { etiqueta: 'Diferencia', valor: dif === 0 ? '$0.00 · Cuadrado' : `${dif > 0 ? '+' : '−'}${formatearDinero(Math.abs(dif))} · ${dif > 0 ? 'Sobrante' : 'Faltante'}`, exito: dif === 0 },
      { etiqueta: 'Fondo que dejó', valor: formatearDinero(c.fondoQueQueda) },
    ],
  };
}

/** Pedidos del jefe que llegan hoy, productos sin existencias y los que solo tienen piezas apartadas. */
export function panelAvisos(productos: ProductoInventario[], pedidos: Pedido[]): Panel {
  const hoy = new Date().toDateString();
  const avisos = [
    ...pedidos.filter((p) => new Date(p.llega).toDateString() === hoy).map((p) => `${p.folio} del jefe llega hoy: recíbelo en Inventario › Entrada contra pedido.`),
    ...productos.filter((p) => p.stock === 0 && !p.usoInterno).map((p) => `${p.nombre} · sin existencias`),
    ...productos
      .filter((p) => p.stock > 0 && disponible(p) === 0)
      .map((p) => `${p.nombre} · 0 disponibles (${apartadas(p)} ${apartadas(p) === 1 ? 'apartada' : 'apartadas'} para ${p.apartados.map((a) => a.folio).join(', ')})`),
  ];
  return { tipo: 'avisos', titulo: 'Avisos de inventario', avisos: avisos.slice(0, 3) };
}

export type { Fila };
