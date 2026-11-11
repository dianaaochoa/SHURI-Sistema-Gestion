import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../acceso/auth.service';
import { CajaService, NombreTurno } from '../caja.service';
import { OrdenesService } from '../ordenes/ordenes.service';
import { MetodoSimple, redondear } from '../punto-de-venta/venta.service';
import { HistorialVentasService, VentaRegistrada } from '../ventas/historial-ventas.service';

export type MetodoCorte = MetodoSimple | 'mixto';

/** Un renglón de "Turno actual" (C10.1). */
export interface MovimientoTurno {
  fecha: string;
  concepto: string;
  metodo: MetodoCorte;
  /** Negativo = sale de la caja. */
  monto: number;
}

export interface Corte {
  folio: string;
  caja: string;
  turno: NombreTurno;
  cajera: string;
  desde: string;
  hasta: string;
  fondo: number;
  ventas: number;
  numVentas: number;
  reparaciones: number;
  /** Retiros, pagos a proveedor y devoluciones en efectivo (negativo) más ingresos. */
  retiros: number;
  esperado: number;
  contado: number;
  tarjeta: number;
  transferencias: number;
  /** Efectivo que se queda en la caja para el siguiente turno. */
  fondoQueQueda: number;
  comentario: string;
  /** Renglones del corte impreso (C11). Los cortes de prueba no lo traen. */
  desglose?: Desglose;
}

export interface Desglose {
  entregas: number;
  numEntregas: number;
  anticipos: number;
  numAnticipos: number;
  devoluciones: number;
  numDevoluciones: number;
  retiros: number;
  numRetiros: number;
  pagos: number;
  numPagos: number;
  ingresos: number;
  numIngresos: number;
}

export const METODO_TEXTO: Record<MetodoCorte, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', mixto: 'Mixto' };

export const diferencia = (c: Pick<Corte, 'contado' | 'esperado'>) => redondear(c.contado - c.esperado);

export function estadoCorte(c: Pick<Corte, 'contado' | 'esperado'>): { texto: string; tono: string } {
  const d = diferencia(c);
  return d === 0 ? { texto: 'Cuadrado', tono: 'exito' } : d < 0 ? { texto: 'Faltante', tono: 'advertencia' } : { texto: 'Sobrante', tono: 'info' };
}

/** Cortes de prueba: los de Figma C10.2 en los días anteriores (2 turnos por día, ~40 días). */
function cortesDemo(): Corte[] {
  const lista: Corte[] = [];
  const hoy = new Date();
  // Diferencias de Figma: la mayoría cuadran; de vez en cuando un faltante o un sobrante.
  const diferencias = [0, -30, 20, 0, -35, 0, 0, 0, 0, 0, 0, -15, 0, 0, 10, 0, 0, 0, -20, 0];
  let folio = 411;
  for (let d = 1; d <= 40; d++) {
    for (const turno of ['Vespertino', 'Matutino'] as NombreTurno[]) {
      const dia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - d);
      if (dia.getDay() === 0 && turno === 'Vespertino') continue;
      const i = lista.length;
      const semilla = (dia.getDate() * 7 + (turno === 'Matutino' ? 3 : 5)) % 17;
      const ventas = 4200 + semilla * 210;
      const reparaciones = 2100 + ((semilla * 137) % 1900);
      const tarjeta = Math.round(ventas * 0.3);
      const transferencias = Math.round(ventas * 0.14);
      const retiros = semilla % 3 === 0 ? -1000 : -500;
      const esperado = 1000 + ventas + reparaciones - tarjeta - transferencias + retiros;
      const dif = diferencias[i % diferencias.length];
      const [h1, h2] = turno === 'Matutino' ? [9, 15] : [15, 21];
      lista.push({
        folio: `C-${String(folio--).padStart(4, '0')}`,
        caja: 'Caja 01',
        turno,
        cajera: turno === 'Matutino' ? 'Ana Martínez' : 'Luis Peña',
        desde: new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), h1).toISOString(),
        hasta: new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), h2, 2).toISOString(),
        fondo: 1000,
        ventas,
        numVentas: 14 + (semilla % 11),
        reparaciones,
        retiros,
        esperado,
        contado: esperado + dif,
        tarjeta,
        transferencias,
        fondoQueQueda: 1000,
        comentario: dif < 0 ? 'Faltante por cambio mal entregado, se reportó a gerencia.' : dif > 0 ? 'Sobrante: un cliente no esperó su cambio.' : '',
      });
    }
  }
  return lista;
}

/** C10 · Corte de caja: lo que entró y salió en el turno abierto, arqueo y cortes anteriores. Simulado. */
@Injectable({ providedIn: 'root' })
export class CorteService {
  private readonly caja = inject(CajaService);
  private readonly ventas = inject(HistorialVentasService);
  private readonly ordenes = inject(OrdenesService);
  private readonly auth = inject(AuthService);

  readonly cortes = signal<Corte[]>(cortesDemo());

  /** Todo lo que movió dinero desde que se abrió el turno, del más reciente al más antiguo. */
  readonly movimientos = computed<MovimientoTurno[]>(() => {
    const turno = this.caja.turno();
    if (!turno) return [];
    const en = (iso: string) => iso >= turno.desde;
    const lista: MovimientoTurno[] = [{ fecha: turno.desde, concepto: 'Apertura de caja · Fondo inicial', metodo: 'efectivo', monto: turno.fondo }];

    for (const v of this.ventas.ventas()) {
      if (en(v.fecha) && v.estado !== 'cancelada') lista.push({ fecha: v.fecha, concepto: `Venta ${v.folio} · ${resumenVenta(v)}`, metodo: v.metodo, monto: v.total });
      for (const d of v.devoluciones) {
        if (!en(d.fecha) || d.forma === 'nota' || d.forma === 'cambio') continue;
        lista.push({ fecha: d.fecha, concepto: `Devolución ${v.folio}`, metodo: d.forma as MetodoSimple, monto: -d.monto });
      }
    }
    for (const o of this.ordenes.ordenes()) {
      if (o.anticipo > 0 && en(o.recibido) && o.metodoAnticipo) {
        lista.push({ fecha: o.recibido, concepto: `Anticipo orden ${o.folio} · ${o.cliente.nombre} · ${o.equipo}`, metodo: o.metodoAnticipo as MetodoSimple, monto: o.anticipo });
      }
      if (o.entrega && en(o.entrega.fecha) && o.entrega.cobrado) {
        const concepto = o.entrega.cobrado < 0 ? `Devolución de anticipo ${o.folio} · ${o.cliente.nombre}` : `Entrega ${o.folio} · ${o.equipo}`;
        lista.push({ fecha: o.entrega.fecha, concepto, metodo: (o.entrega.metodo ?? 'efectivo') as MetodoSimple, monto: o.entrega.cobrado });
      }
    }
    for (const p of this.caja.pagosAProveedor()) {
      if (en(p.fecha)) lista.push({ fecha: p.fecha, concepto: `Pago a proveedor${p.pedido ? ` ${p.pedido}` : ''} · ${p.documento}`, metodo: 'efectivo', monto: -p.monto });
    }
    for (const m of this.caja.movimientos()) {
      if (en(m.fecha)) lista.push({ fecha: m.fecha, concepto: m.tipo === 'retiro' ? `Retiro · ${m.motivo}` : `Ingreso · ${m.motivo}`, metodo: 'efectivo', monto: m.tipo === 'retiro' ? -m.monto : m.monto });
    }
    return lista.sort((a, b) => b.fecha.localeCompare(a.fecha));
  });

  /** Cifras del turno abierto (C10.1). */
  readonly resumen = computed(() => {
    const turno = this.caja.turno();
    const desde = turno?.desde ?? '9999';
    const ventas = this.ventas.ventas().filter((v) => v.fecha >= desde && v.estado !== 'cancelada');
    // Incluye los anticipos devueltos al entregar sin reparar (cobrado negativo).
    const entregas = this.ordenes.ordenes().filter((o) => o.entrega && o.entrega.fecha >= desde && (o.entrega.cobrado ?? 0) !== 0);
    const anticipos = this.ordenes.ordenes().filter((o) => o.anticipo > 0 && o.recibido >= desde && o.metodoAnticipo);
    const retiros = this.caja.movimientos().filter((m) => m.fecha >= desde && m.tipo === 'retiro');
    const ingresos = this.caja.movimientos().filter((m) => m.fecha >= desde && m.tipo === 'ingreso');
    const pagos = this.caja.pagosAProveedor().filter((p) => p.fecha >= desde);
    const devoluciones = this.ventas
      .ventas()
      .flatMap((v) => v.devoluciones)
      .filter((d) => d.fecha >= desde && (d.forma === 'efectivo' || d.forma === 'tarjeta'));
    const suma = (lista: { monto: number }[]) => redondear(lista.reduce((s, x) => s + x.monto, 0));
    const desglose: Desglose = {
      entregas: redondear(entregas.reduce((s, o) => s + (o.entrega!.cobrado ?? 0), 0)),
      numEntregas: entregas.length,
      anticipos: redondear(anticipos.reduce((s, o) => s + o.anticipo, 0)),
      numAnticipos: anticipos.length,
      devoluciones: suma(devoluciones),
      numDevoluciones: devoluciones.length,
      retiros: suma(retiros),
      numRetiros: retiros.length,
      pagos: suma(pagos),
      numPagos: pagos.length,
      ingresos: suma(ingresos),
      numIngresos: ingresos.length,
    };

    // Efectivo, tarjeta y transferencia: los cobros mixtos se reparten por sus partes.
    const porMetodo: Record<MetodoSimple, number> = { efectivo: 0, tarjeta: 0, transferencia: 0 };
    for (const m of this.movimientos()) {
      if (m.metodo !== 'mixto') porMetodo[m.metodo] += m.monto;
    }
    for (const v of ventas.filter((x) => x.metodo === 'mixto')) {
      for (const p of v.partes ?? []) porMetodo[p.metodo] += p.monto ?? 0;
    }

    return {
      fondo: turno?.fondo ?? 0,
      ventas: redondear(ventas.reduce((s, v) => s + v.total, 0)),
      numVentas: ventas.length,
      reparaciones: redondear(entregas.reduce((s, o) => s + (o.entrega!.cobrado ?? 0), 0) + anticipos.reduce((s, o) => s + o.anticipo, 0)),
      numEntregas: entregas.length,
      numAnticipos: anticipos.length,
      retiros: redondear(-retiros.reduce((s, m) => s + m.monto, 0) - pagos.reduce((s, p) => s + p.monto, 0) + ingresos.reduce((s, m) => s + m.monto, 0)),
      numRetiros: retiros.length,
      numPagos: pagos.length,
      numIngresos: ingresos.length,
      esperado: redondear(porMetodo.efectivo),
      tarjeta: redondear(porMetodo.tarjeta),
      transferencias: redondear(porMetodo.transferencia),
      desglose,
    };
  });

  /** Efectivo que debería haber en el cajón (para retiros y pagos a proveedor). 0 con la caja cerrada. */
  readonly efectivoEnCaja = computed(() => (this.caja.abierta() ? this.resumen().esperado : 0));

  siguienteFolio(): string {
    const max = Math.max(0, ...this.cortes().map((c) => Number(c.folio.slice(2))));
    return `C-${String(max + 1).padStart(4, '0')}`;
  }

  /** C10.4: guarda el corte, cierra el turno y devuelve el corte para C10.5. */
  cerrar(contado: number, comentario: string, fondoQueQueda: number): Corte {
    const turno = this.caja.turno()!;
    const r = this.resumen();
    const corte: Corte = {
      folio: this.siguienteFolio(),
      caja: turno.caja,
      turno: turno.turno,
      cajera: this.auth.sesion()?.nombre ?? '',
      desde: turno.desde,
      hasta: new Date().toISOString(),
      fondo: r.fondo,
      ventas: r.ventas,
      numVentas: r.numVentas,
      reparaciones: r.reparaciones,
      retiros: r.retiros,
      esperado: r.esperado,
      contado: redondear(contado),
      tarjeta: r.tarjeta,
      transferencias: r.transferencias,
      fondoQueQueda: redondear(fondoQueQueda),
      comentario,
      desglose: r.desglose,
    };
    this.cortes.update((lista) => [corte, ...lista]);
    this.caja.cerrarTurno();
    return corte;
  }
}

/** "5 artículos", "Cargador USB-C 20W" o "Mica + funda" (Figma C10.1). */
function resumenVenta(v: VentaRegistrada): string {
  const piezas = v.lineas.reduce((s, l) => s + l.cantidad, 0);
  if (v.lineas.length === 1 && piezas === 1) return v.lineas[0].nombre;
  if (v.lineas.length === 2 && piezas === 2) return v.lineas.map((l, i) => (i ? l.nombre.split(' ')[0].toLowerCase() : l.nombre.split(' ')[0])).join(' + ');
  return `${piezas} artículos`;
}
