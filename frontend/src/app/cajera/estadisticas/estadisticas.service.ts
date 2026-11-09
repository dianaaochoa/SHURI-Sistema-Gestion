import { Injectable, computed, inject } from '@angular/core';
import { formatearFechaLarga } from '../../compartido/formato';
import { EstadoOrden, OrdenesService } from '../ordenes/ordenes.service';
import { MetodoSimple, redondear } from '../punto-de-venta/venta.service';
import { HistorialVentasService, reembolsado } from '../ventas/historial-ventas.service';
import { DiaEstadistico, NOMBRE_POR_SKU, claveDia, historialDemo } from './estadisticas.datos';

export type Periodo = 'hoy' | 'semana' | 'mes' | 'anio';

export interface Grupo {
  etiqueta: string;
  ventas: number;
  reparaciones: number;
  /** Aún no llega (días, semanas o meses futuros del periodo). */
  futuro: boolean;
}

export interface Estadisticas {
  descripcion: string;
  mostrador: number;
  /** Cambio contra el mismo tramo del periodo anterior (null si antes no hubo ventas). */
  cambio: number | null;
  contra: string;
  reparaciones: number;
  entregados: number;
  ventas: number;
  ticket: number;
  respondidos: number;
  aprobados: number;
  grafica: { titulo: string; grupos: Grupo[] };
  productos: { nombre: string; piezas: number; ingresos: number }[];
  metodos: { metodo: MetodoSimple; texto: string; monto: number; porcentaje: number }[];
}

const METODOS: Record<MetodoSimple, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const BLOQUES = [9, 11, 13, 15, 17, 19];

const vacio = (dia: string): DiaEstadistico => ({
  dia,
  ventas: 0,
  mostrador: 0,
  reparaciones: 0,
  entregados: 0,
  respondidos: 0,
  aprobados: 0,
  productos: {},
  metodos: { efectivo: 0, tarjeta: 0, transferencia: 0 },
});

const mes = (f: Date, largo = true) => f.toLocaleDateString('es-MX', { month: largo ? 'long' : 'short' }).replace('.', '');
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Estado de la orden → renglón de "Reparaciones por estado". */
export const ESTADOS_TALLER: { texto: string; color: string; estados: EstadoOrden[] }[] = [
  { texto: 'Por cotizar', color: '#64748b', estados: ['por-cotizar'] },
  { texto: 'Por aprobar', color: 'var(--color-advertencia)', estados: ['por-aprobar', 'adicional'] },
  { texto: 'En taller', color: 'var(--color-primario)', estados: ['en-taller', 'esperando-refaccion'] },
  { texto: 'Listo para entregar', color: 'var(--color-exito)', estados: ['lista', 'garantia-lista', 'sin-reparacion'] },
  { texto: 'Vencidos y en bodega', color: '#94a3b8', estados: ['vencida', 'bodega'] },
  { texto: 'En garantía', color: 'var(--color-peligro)', estados: ['en-garantia'] },
];

/** C9 · Estadísticas: historial de prueba por día + las ventas y órdenes que ya existen en la app. */
@Injectable({ providedIn: 'root' })
export class EstadisticasService {
  private readonly ventas = inject(HistorialVentasService);
  private readonly ordenes = inject(OrdenesService);
  private readonly demo = historialDemo();

  /** Días con datos: el historial de prueba más lo registrado en Ventas y Órdenes. */
  private readonly dias = computed(() => {
    const mapa = new Map<string, DiaEstadistico>(this.demo.map((d) => [d.dia, structuredClone(d)]));
    const de = (iso: string) => {
      const clave = claveDia(new Date(iso));
      if (!mapa.has(clave)) mapa.set(clave, vacio(clave));
      return mapa.get(clave)!;
    };
    for (const v of this.ventas.ventas()) {
      if (v.estado === 'cancelada') continue;
      const d = de(v.fecha);
      const total = redondear(v.total - reembolsado(v));
      d.ventas++;
      d.mostrador += total;
      for (const l of v.lineas) {
        const nombre = NOMBRE_POR_SKU[l.sku] ?? l.nombre;
        const actual = d.productos[nombre] ?? { piezas: 0, ingresos: 0 };
        d.productos[nombre] = { piezas: actual.piezas + l.cantidad, ingresos: actual.ingresos + redondear(l.precio * l.cantidad * (1 - l.descuento / 100) * 1.16) };
      }
      if (v.metodo === 'mixto') for (const p of v.partes ?? []) d.metodos[p.metodo] += p.monto ?? 0;
      else d.metodos[v.metodo] += total;
    }
    for (const o of this.ordenes.ordenes()) {
      if (o.entrega) {
        const d = de(o.entrega.fecha);
        d.entregados++;
        d.reparaciones += o.entrega.pagado;
      }
      if (o.presupuesto?.aprobado) {
        const d = de(o.presupuesto.aprobado);
        d.respondidos++;
        d.aprobados++;
      }
      if (o.rechazo) de(o.rechazo).respondidos++;
    }
    return mapa;
  });

  /** Equipos en el taller ahora mismo, por estado. */
  readonly porEstado = computed(() =>
    ESTADOS_TALLER.map((e) => ({ ...e, cantidad: this.ordenes.ordenes().filter((o) => e.estados.includes(o.estado)).length })),
  );

  private suma(desde: Date, hasta: Date): DiaEstadistico {
    const total = vacio('');
    for (let f = new Date(desde); f <= hasta; f.setDate(f.getDate() + 1)) {
      const d = this.dias().get(claveDia(f));
      if (!d) continue;
      total.ventas += d.ventas;
      total.mostrador += d.mostrador;
      total.reparaciones += d.reparaciones;
      total.entregados += d.entregados;
      total.respondidos += d.respondidos;
      total.aprobados += d.aprobados;
      for (const [n, p] of Object.entries(d.productos)) {
        const a = total.productos[n] ?? { piezas: 0, ingresos: 0 };
        total.productos[n] = { piezas: a.piezas + p.piezas, ingresos: a.ingresos + p.ingresos };
      }
      for (const m of Object.keys(d.metodos) as MetodoSimple[]) total.metodos[m] += d.metodos[m];
    }
    return total;
  }

  calcular(periodo: Periodo, hoy = new Date()): Estadisticas {
    const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const dia = (y: number, m: number, d: number) => new Date(y, m, d);
    let desde: Date, antesDesde: Date, antesHasta: Date, descripcion: string, contra: string;
    let grafica: Estadisticas['grafica'];

    switch (periodo) {
      case 'hoy': {
        desde = h;
        antesDesde = antesHasta = dia(h.getFullYear(), h.getMonth(), h.getDate() - 1);
        descripcion = formatearFechaLarga(h);
        contra = 'vs ayer';
        grafica = { titulo: 'Ingresos por hora', grupos: this.porHora(h, hoy) };
        break;
      }
      case 'semana': {
        desde = dia(h.getFullYear(), h.getMonth(), h.getDate() - ((h.getDay() + 6) % 7));
        antesDesde = dia(desde.getFullYear(), desde.getMonth(), desde.getDate() - 7);
        antesHasta = dia(h.getFullYear(), h.getMonth(), h.getDate() - 7);
        descripcion = `Semana del ${desde.getDate()} ${mes(desde, false)} al ${h.getDate()} ${mes(h, false)} ${h.getFullYear()}`;
        contra = 'vs semana pasada';
        grafica = {
          titulo: 'Ingresos por día',
          grupos: DIAS.map((etiqueta, i) => this.grupo(etiqueta, dia(desde.getFullYear(), desde.getMonth(), desde.getDate() + i), dia(desde.getFullYear(), desde.getMonth(), desde.getDate() + i), h)),
        };
        break;
      }
      case 'anio': {
        desde = dia(h.getFullYear(), 0, 1);
        antesDesde = dia(h.getFullYear() - 1, 0, 1);
        antesHasta = dia(h.getFullYear() - 1, h.getMonth(), h.getDate());
        descripcion = `${h.getFullYear()}`;
        contra = `vs ${h.getFullYear() - 1} al ${h.getDate()} ${mes(h, false)}`;
        grafica = { titulo: 'Ingresos por mes', grupos: MESES.map((etiqueta, m) => this.grupo(etiqueta, dia(h.getFullYear(), m, 1), dia(h.getFullYear(), m + 1, 0), h)) };
        break;
      }
      default: {
        desde = dia(h.getFullYear(), h.getMonth(), 1);
        antesDesde = dia(h.getFullYear(), h.getMonth() - 1, 1);
        antesHasta = dia(h.getFullYear(), h.getMonth() - 1, Math.min(h.getDate(), dia(h.getFullYear(), h.getMonth(), 0).getDate()));
        descripcion = capital(`${mes(h)} ${h.getFullYear()}`);
        contra = `vs ${mes(antesDesde)}${h.getDate() < dia(h.getFullYear(), h.getMonth() + 1, 0).getDate() ? ` (1–${antesHasta.getDate()})` : ''}`;
        const ultimo = dia(h.getFullYear(), h.getMonth() + 1, 0).getDate();
        // Como Figma: 4 semanas; la cuarta junta del 22 al fin de mes.
        const semanas = 4;
        grafica = {
          titulo: 'Ingresos por semana',
          grupos: Array.from({ length: semanas }, (_, s) =>
            this.grupo(`Sem ${s + 1}`, dia(h.getFullYear(), h.getMonth(), s * 7 + 1), dia(h.getFullYear(), h.getMonth(), s === semanas - 1 ? ultimo : s * 7 + 7), h),
          ),
        };
      }
    }

    const actual = this.suma(desde, h);
    const antes = this.suma(antesDesde, antesHasta);
    const totalMetodos = Object.values(actual.metodos).reduce((s, m) => s + m, 0);
    return {
      descripcion,
      mostrador: actual.mostrador,
      cambio: antes.mostrador > 0 ? Math.round(((actual.mostrador - antes.mostrador) / antes.mostrador) * 100) : null,
      contra,
      reparaciones: actual.reparaciones,
      entregados: actual.entregados,
      ventas: actual.ventas,
      ticket: actual.ventas ? actual.mostrador / actual.ventas : 0,
      respondidos: actual.respondidos,
      aprobados: actual.aprobados,
      grafica,
      productos: Object.entries(actual.productos)
        .map(([nombre, p]) => ({ nombre, ...p }))
        .sort((a, b) => b.piezas - a.piezas || b.ingresos - a.ingresos)
        .slice(0, 5),
      metodos: (Object.keys(METODOS) as MetodoSimple[]).map((metodo) => ({
        metodo,
        texto: METODOS[metodo],
        monto: actual.metodos[metodo],
        porcentaje: totalMetodos ? Math.round((actual.metodos[metodo] / totalMetodos) * 100) : 0,
      })),
    };
  }

  private grupo(etiqueta: string, desde: Date, hasta: Date, hoy: Date): Grupo {
    if (desde > hoy) return { etiqueta, ventas: 0, reparaciones: 0, futuro: true };
    const s = this.suma(desde, hasta < hoy ? hasta : hoy);
    return { etiqueta, ventas: s.mostrador, reparaciones: s.reparaciones, futuro: false };
  }

  /** Hoy por bloques de 2 horas (solo hay hora en lo registrado en la app). */
  private porHora(dia: Date, ahora: Date): Grupo[] {
    const clave = claveDia(dia);
    const ventas = this.ventas.ventas().filter((v) => v.estado !== 'cancelada' && claveDia(new Date(v.fecha)) === clave);
    const entregas = this.ordenes.ordenes().filter((o) => o.entrega && claveDia(new Date(o.entrega.fecha)) === clave);
    return BLOQUES.map((inicio) => {
      const en = (iso: string) => new Date(iso).getHours() >= inicio && new Date(iso).getHours() < inicio + 2;
      return {
        etiqueta: `${inicio}–${inicio + 2} h`,
        ventas: ventas.filter((v) => en(v.fecha)).reduce((s, v) => s + v.total - reembolsado(v), 0),
        reparaciones: entregas.filter((o) => en(o.entrega!.fecha)).reduce((s, o) => s + o.entrega!.pagado, 0),
        futuro: inicio > ahora.getHours(),
      };
    });
  }
}
