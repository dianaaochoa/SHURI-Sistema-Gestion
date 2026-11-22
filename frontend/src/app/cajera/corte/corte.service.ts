import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../acceso/auth.service';
import { mensajeDeError } from '../../api/errores-api';
import { CajaService, MovimientoCaja, NombreTurno, ResumenTurnoApi, TURNO_DE_API, TurnoApi, movimientoDesdeApi } from '../caja.service';
import { MetodoSimple, VentaService, redondear } from '../punto-de-venta/venta.service';

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
  /** Id del turno en la API. */
  id?: number;
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
  /** Retiros y pagos a proveedor en efectivo (negativo) más ingresos. */
  retiros: number;
  esperado: number;
  contado: number;
  tarjeta: number;
  transferencias: number;
  /** Efectivo que se queda en la caja para el siguiente turno. */
  fondoQueQueda: number;
  comentario: string;
  /** Renglones del corte impreso (C11). */
  desglose?: Desglose;
  /** Visto bueno del administrador cuando hubo diferencia (AD3.2). */
  revision?: RevisionCorte;
  /** Quién contó y cerró, cuando no fue la cajera que abrió el turno. */
  cerradoPor?: string;
}

export type DecisionCorte = 'descontar' | 'absorber' | 'investigar';

export interface RevisionCorte {
  decision: DecisionCorte;
  fecha: string;
  por: string;
  nota?: string;
}

/** Cómo queda el corte para el administrador (AD3.1). */
export function revisionDe(c: Corte): { texto: string; tono: string; pendiente: boolean } {
  if (c.revision?.decision === 'descontar') return { texto: 'Descontado', tono: 'neutro', pendiente: false };
  if (c.revision?.decision === 'absorber') return { texto: 'Absorbido', tono: 'neutro', pendiente: false };
  if (c.revision?.decision === 'investigar') return { texto: 'En investigación', tono: 'advertencia', pendiente: true };
  if (c.contado === c.esperado) return { texto: 'Revisado', tono: 'exito', pendiente: false };
  return { texto: 'Por revisar', tono: 'advertencia', pendiente: true };
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

/** Venta del turno como la responde la API (GET /sales?cash_shift_id=). */
interface VentaApi {
  folio: string;
  status: string;
  total: number;
  items: { type: string; description: string; quantity: number }[];
  payments: { method: string; amount: number }[];
  paid_at: string | null;
  created_at: string;
}

const METODO_DE_API: Record<string, MetodoSimple> = { cash: 'efectivo', card: 'tarjeta', transfer: 'transferencia' };
const DECISION_DE_API: Record<string, DecisionCorte> = { deduct: 'descontar', absorb: 'absorber', investigate: 'investigar' };
const DECISION_A_API: Record<DecisionCorte, string> = { descontar: 'deduct', absorber: 'absorb', investigar: 'investigate' };
const REPARACION = ['service_order', 'additional_charge', 'storage_fee', 'deposit'];

/** "5 artículos", "Cargador USB-C 20W" o "Mica + funda" (Figma C10.1). */
function resumenVenta(items: VentaApi['items']): string {
  const piezas = items.reduce((s, l) => s + l.quantity, 0);
  if (items.length === 1 && piezas === 1) return items[0].description;
  if (items.length === 2 && piezas === 2) return items.map((l, i) => (i ? l.description.split(' ')[0].toLowerCase() : l.description.split(' ')[0])).join(' + ');
  return `${piezas} artículos`;
}

/** Una venta como renglón del turno: método de pago (o mixto) y qué se cobró. */
function movimientoDeVenta(v: VentaApi): MovimientoTurno {
  const metodos = new Set(v.payments.map((p) => METODO_DE_API[p.method]).filter(Boolean));
  const metodo: MetodoCorte = metodos.size > 1 ? 'mixto' : ([...metodos][0] ?? 'efectivo');
  const entrega = v.items.find((i) => REPARACION.includes(i.type));
  const concepto = entrega ? `Entrega ${v.folio} · ${entrega.description}` : `Venta ${v.folio} · ${resumenVenta(v.items)}`;
  return { fecha: v.paid_at ?? v.created_at, concepto, metodo, monto: Number(v.total) };
}

/** Todo lo que movió dinero en un turno, del más reciente al más antiguo. */
function armarMovimientos(desde: string, fondo: number, ventas: VentaApi[], caja: MovimientoCaja[]): MovimientoTurno[] {
  const lista: MovimientoTurno[] = [{ fecha: desde, concepto: 'Apertura de caja · Fondo inicial', metodo: 'efectivo', monto: fondo }];
  for (const v of ventas) {
    if (v.status !== 'cancelled') lista.push(movimientoDeVenta(v));
  }
  for (const m of caja) {
    lista.push({ fecha: m.fecha, concepto: m.tipo === 'retiro' ? `Retiro ${m.folio} · ${m.motivo}` : `Ingreso · ${m.motivo}`, metodo: 'efectivo', monto: m.tipo === 'retiro' ? -m.monto : m.monto });
  }
  return lista.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function desgloseDe(s: ResumenTurnoApi): Desglose {
  return {
    entregas: s.repairs_total,
    numEntregas: s.repairs_count,
    anticipos: 0,
    numAnticipos: 0,
    devoluciones: s.cash_refunds,
    numDevoluciones: 0,
    retiros: s.cash_out,
    numRetiros: s.cash_out_count,
    pagos: s.cash_supplier_payments,
    numPagos: 0,
    ingresos: s.cash_in,
    numIngresos: s.cash_in_count,
  };
}

/** Retiros a gerencia y pagos a proveedor (salen) más ingresos (entran). */
const netoRetiros = (s: ResumenTurnoApi) => redondear(-s.cash_out - s.cash_supplier_payments + s.cash_in);

function corteDesdeApi(t: TurnoApi): Corte {
  const s = t.summary;
  const cajera = t.cashier?.name ?? '';
  return {
    id: t.id,
    folio: t.folio ?? '',
    caja: t.cash_register?.name ?? 'Caja 01',
    turno: TURNO_DE_API[t.shift] ?? 'Matutino',
    cajera,
    cerradoPor: t.closed_by && t.closed_by !== cajera ? t.closed_by : undefined,
    desde: t.opened_at,
    hasta: t.closed_at ?? t.opened_at,
    fondo: Number(t.opening_amount),
    ventas: s?.products_total ?? 0,
    numVentas: s?.products_count ?? 0,
    reparaciones: s?.repairs_total ?? 0,
    retiros: s ? netoRetiros(s) : 0,
    esperado: Number(t.expected_cash ?? 0),
    contado: Number(t.counted_cash ?? 0),
    tarjeta: Number(t.card_total ?? 0),
    transferencias: Number(t.transfer_total ?? 0),
    fondoQueQueda: Number(t.cash_left ?? 0),
    comentario: t.closing_notes ?? '',
    desglose: s ? desgloseDe(s) : undefined,
    revision: t.reviewed_at
      ? {
          decision: DECISION_DE_API[t.review_decision ?? ''] ?? 'absorber',
          fecha: t.reviewed_at,
          por: t.reviewed_by ?? '',
          nota: t.review_comment ?? undefined,
        }
      : undefined,
  };
}

/** Lo que se ve del turno cuando no hay datos (caja cerrada). */
const RESUMEN_VACIO: ResumenTurnoApi = {
  opening_amount: 0, cash_sales: 0, card_sales: 0, transfer_sales: 0, cash_in: 0, cash_out: 0, cash_refunds: 0,
  cash_supplier_payments: 0, expected_cash: 0, sales_count: 0, products_total: 0, products_count: 0,
  repairs_total: 0, repairs_count: 0, cash_out_count: 0, cash_in_count: 0,
};

/**
 * C10 · Corte de caja conectado a la API: lo que entró y salió en el turno abierto,
 * el corte (C10.4), los cortes anteriores (C10.2) y la revisión del administrador (AD3).
 */
@Injectable({ providedIn: 'root' })
export class CorteService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly caja = inject(CajaService);
  private readonly auth = inject(AuthService);
  private readonly venta = inject(VentaService);

  readonly cortes = signal<Corte[]>([]);
  /** Ventas de mi turno abierto. */
  private readonly ventasTurno = signal<VentaApi[]>([]);
  /** Movimientos y resumen de otros turnos (cortes cerrados o el turno abierto de otra cajera). */
  private readonly detalles = signal<Record<number, { movimientos: MovimientoTurno[]; resumen: ResumenTurnoApi }>>({});

  constructor() {
    effect(() => {
      const sesion = this.auth.sesion();
      untracked(() => (sesion ? this.cargarCortes() : this.cortes.set([])));
    });
    // Al cambiar mi turno (abrir, vender, cerrar) se recargan sus ventas
    effect(() => {
      const id = this.caja.turno()?.id;
      this.caja.resumenApi();
      untracked(() => (id ? this.cargarVentas(id) : this.ventasTurno.set([])));
    });
    // El administrador ve en vivo el turno que tenga abierto la cajera
    effect(() => {
      const ajeno = this.caja.ajeno();
      untracked(() => {
        if (ajeno?.id) this.cargarDetalle(ajeno.id);
      });
    });
  }

  /** Todo lo que movió dinero desde que se abrió el turno, del más reciente al más antiguo. */
  readonly movimientos = computed<MovimientoTurno[]>(() => {
    const propio = this.caja.turno();
    if (propio) return armarMovimientos(propio.desde, propio.fondo, this.ventasTurno(), this.caja.movimientos());
    const ajeno = this.caja.ajeno();
    return ajeno?.id ? (this.detalles()[ajeno.id]?.movimientos ?? []) : [];
  });

  /** Movimientos de un tramo (turno abierto o un corte cerrado, AD3.2). Se cargan con `cargarDetalle`. */
  movimientosEntre(desde: string, _hasta: string, fondo: number): MovimientoTurno[] {
    const propio = this.caja.turno();
    if (propio && propio.desde === desde) return this.movimientos();
    const ajeno = this.caja.ajeno();
    const id = ajeno && ajeno.desde === desde ? ajeno.id : this.cortes().find((c) => c.desde === desde)?.id;
    return (id && this.detalles()[id]?.movimientos) || [{ fecha: desde, concepto: 'Apertura de caja · Fondo inicial', metodo: 'efectivo', monto: fondo }];
  }

  /** Carga las ventas y movimientos de un corte (o del turno abierto en la caja si no se indica). */
  cargarDetalle(id?: number | null): void {
    const turnoId = id ?? this.caja.turnoDeCaja()?.id;
    if (!turnoId) return;
    forkJoin({
      turno: this.http.get<{ data: TurnoApi; summary: ResumenTurnoApi }>(`${this.api}/cash-shifts/${turnoId}`),
      ventas: this.http.get<{ data: VentaApi[] }>(`${this.api}/sales`, { params: { cash_shift_id: turnoId, per_page: 100 } }).pipe(catchError(() => of({ data: [] as VentaApi[] }))),
    }).subscribe({
      next: ({ turno, ventas }) => {
        const t = turno.data;
        const caja = (t.movements ?? []).map((m) => movimientoDesdeApi(m, t.cashier?.name));
        this.detalles.update((d) => ({ ...d, [turnoId]: { movimientos: armarMovimientos(t.opened_at, Number(t.opening_amount), ventas.data, caja), resumen: turno.summary } }));
      },
      error: () => undefined,
    });
  }

  /** AD3.2 · Visto bueno del administrador: la diferencia se descuenta, se absorbe o se investiga. */
  revisar(corte: Corte, decision: DecisionCorte, nota: string): Observable<{ ok: boolean; mensaje: string }> {
    if (!corte.id) return of({ ok: false, mensaje: 'Este corte no existe en el servidor.' });
    return this.http
      .post<{ message: string; data: TurnoApi; summary: ResumenTurnoApi }>(`${this.api}/cash-shifts/${corte.id}/review`, {
        decision: DECISION_A_API[decision],
        comment: nota.trim() || null,
      })
      .pipe(
        tap((r) => this.cortes.update((lista) => lista.map((c) => (c.id === corte.id ? corteDesdeApi({ ...r.data, summary: r.summary }) : c)))),
        map((r) => ({ ok: true, mensaje: r.message })),
        catchError((e) => of({ ok: false, mensaje: mensajeDeError(e) })),
      );
  }

  /** Cifras del turno abierto (C10.1): el mío o, para el administrador, el de la cajera. */
  readonly resumen = computed(() => {
    const turno = this.caja.turnoDeCaja();
    const ajeno = this.caja.ajeno();
    const s = this.caja.resumenApi() ?? (ajeno?.id ? this.detalles()[ajeno.id]?.resumen : null) ?? RESUMEN_VACIO;
    return {
      fondo: turno?.fondo ?? s.opening_amount,
      ventas: s.products_total,
      numVentas: s.products_count,
      reparaciones: s.repairs_total,
      numEntregas: s.repairs_count,
      numAnticipos: 0,
      retiros: netoRetiros(s),
      numRetiros: s.cash_out_count,
      numPagos: 0,
      numIngresos: s.cash_in_count,
      esperado: redondear(s.expected_cash),
      tarjeta: redondear(s.card_sales),
      transferencias: redondear(s.transfer_sales),
      desglose: desgloseDe(s),
    };
  });

  /** Efectivo que debería haber en el cajón (para retiros y pagos a proveedor). 0 con la caja cerrada. */
  readonly efectivoEnCaja = computed(() => (this.caja.turnoDeCaja() ? this.resumen().esperado : 0));

  /** C10.4: hace el corte en la API, cierra el turno y devuelve el corte para C10.5. */
  cerrar(contado: number, comentario: string, fondoQueQueda: number): Observable<{ ok: true; corte: Corte; mensaje: string } | { ok: false; mensaje: string }> {
    const turno = this.caja.turnoDeCaja();
    if (!turno?.id) return of({ ok: false as const, mensaje: 'No hay un turno abierto en la caja.' });

    return this.http
      .post<{ message: string; data: TurnoApi; summary: ResumenTurnoApi }>(`${this.api}/cash-shifts/${turno.id}/close`, {
        counted_cash: redondear(contado),
        cash_left: redondear(fondoQueQueda),
        closing_notes: comentario.trim() || null,
      })
      .pipe(
        map((r) => {
          const corte = corteDesdeApi({ ...r.data, summary: r.summary });
          this.cortes.update((lista) => [corte, ...lista.filter((c) => c.id !== corte.id)]);
          this.venta.descartarAlCerrarTurno();
          this.caja.cerrarTurno();
          return { ok: true as const, corte, mensaje: r.message };
        }),
        catchError((e) => of({ ok: false as const, mensaje: mensajeDeError(e) })),
      );
  }

  /** Vuelve a leer mis ventas del turno y los cortes (después de cobrar). */
  refrescar(): void {
    this.caja.refrescar();
    this.cargarCortes();
  }

  private cargarVentas(turnoId: number): void {
    this.http.get<{ data: VentaApi[] }>(`${this.api}/sales`, { params: { cash_shift_id: turnoId, per_page: 100 } }).subscribe({
      next: (r) => this.ventasTurno.set(r.data),
      error: () => this.ventasTurno.set([]),
    });
  }

  private cargarCortes(): void {
    const permisos = this.auth.sesion()?.permisos ?? [];
    if (!permisos.some((p) => ['cash.shift', 'cash.review_closing'].includes(p))) return;
    this.http.get<{ data: TurnoApi[] }>(`${this.api}/cash-shifts`, { params: { per_page: 100 } }).subscribe({
      next: (r) => this.cortes.set(r.data.filter((t) => t.status !== 'open').map(corteDesdeApi)),
      error: () => undefined,
    });
  }
}
