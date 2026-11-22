import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from '../acceso/auth.service';
import { mensajeDeError } from '../api/errores-api';

export type NombreTurno = 'Matutino' | 'Vespertino';

export interface Turno {
  /** Id del turno en la API. */
  id?: number;
  caja: string;
  turno: NombreTurno;
  /** Hora de apertura (ISO). */
  desde: string;
  /** Fondo inicial contado al abrir. */
  fondo: number;
  /** Id (en texto) de quien lo abrió (C1.3). */
  usuario?: string;
  cajera?: string;
}

export interface PagoProveedor {
  fecha: string;
  proveedor: string;
  documento: string;
  pedido: string | null;
  monto: number;
}

export interface MovimientoCaja {
  /** RET-2026-00031 (retiros) o ING (ingresos, que no llevan folio). */
  folio: string;
  fecha: string;
  tipo: 'retiro' | 'ingreso';
  monto: number;
  motivo: string;
  comentario: string;
  /** Quién lo registró (bitácora AD8). */
  por?: string;
}

/** Resumen en vivo del turno (GET /cash-shifts/current › summary). */
export interface ResumenTurnoApi {
  opening_amount: number;
  cash_sales: number;
  card_sales: number;
  transfer_sales: number;
  cash_in: number;
  cash_out: number;
  cash_refunds: number;
  cash_supplier_payments: number;
  expected_cash: number;
  sales_count: number;
  products_total: number;
  products_count: number;
  repairs_total: number;
  repairs_count: number;
  cash_out_count: number;
  cash_in_count: number;
}

/** Turno como lo responde la API (CashShiftResource). */
export interface TurnoApi {
  id: number;
  folio: string | null;
  status: 'open' | 'closed' | 'reviewed';
  shift: 'morning' | 'evening' | 'full_day';
  cash_register?: { id: number; name: string };
  cashier?: { id: number; name: string };
  opened_at: string;
  opening_amount: number;
  closed_at: string | null;
  expected_cash: number | null;
  counted_cash: number | null;
  difference: number | null;
  card_total: number | null;
  transfer_total: number | null;
  cash_left: number | null;
  cash_handed_over: number | null;
  closing_notes: string | null;
  reviewed_by?: string | null;
  reviewed_at: string | null;
  review_decision: 'deduct' | 'absorb' | 'investigate' | null;
  review_comment: string | null;
  closed_by?: string | null;
  summary?: ResumenTurnoApi;
  movements?: { id: number; folio: string | null; type: 'cash_out' | 'cash_in'; amount: number; reason: string; created_at: string }[];
}

/** Caja de la API con el turno que tenga abierto, de quien sea (GET /cash-registers). */
interface CajaApi {
  id: number;
  nombre: string;
  fondo: number;
  abierto: { id: number; turno: NombreTurno; desde: string; fondo: number; cajeraId: number; cajera: string } | null;
}

export const TURNO_DE_API: Record<string, NombreTurno> = { morning: 'Matutino', evening: 'Vespertino', full_day: 'Matutino' };
const TURNO_A_API: Record<NombreTurno, string> = { Matutino: 'morning', Vespertino: 'evening' };

/** Los retiros llevan "motivo · comentario" en el campo reason de la API. */
const SEPARADOR = ' · ';

export function movimientoDesdeApi(m: NonNullable<TurnoApi['movements']>[number], por?: string): MovimientoCaja {
  const [motivo, ...resto] = m.reason.split(SEPARADOR);
  return {
    folio: m.folio ?? 'Ingreso',
    fecha: m.created_at,
    tipo: m.type === 'cash_out' ? 'retiro' : 'ingreso',
    monto: Number(m.amount),
    motivo,
    comentario: resto.join(SEPARADOR),
    por,
  };
}

/**
 * Caja de la cajera (C1, C10) conectada a la API: el turno vive en el servidor, así que si
 * la cajera sale sin cerrarlo, la caja sigue abierta a su nombre en cualquier equipo (C1.7).
 * Otra cajera no puede vender con él ni abrir el suyo hasta que se haga ese corte.
 */
@Injectable({ providedIn: 'root' })
export class CajaService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly auth = inject(AuthService);

  /** Cajas activas con su turno abierto (de quien sea). */
  private readonly registros = signal<CajaApi[]>([]);
  /** Mi turno abierto, con su resumen y movimientos. */
  private readonly mio = signal<TurnoApi | null>(null);
  /** Fondo que cambió el administrador en Configuración › Cajas (AD9.2) mientras no se guarde en la API. */
  private readonly fondoManual = signal<number | null>(null);

  constructor() {
    // Al iniciar o cambiar de sesión se carga el estado de la caja desde la API
    effect(() => {
      const sesion = this.auth.sesion();
      untracked(() => (sesion ? this.refrescar() : this.limpiar()));
    });
  }

  /** Nombres de las cajas activas (["Caja 01"]). */
  get cajas(): string[] {
    const nombres = this.registros().map((r) => r.nombre);
    return nombres.length ? nombres : ['Caja 01'];
  }

  /** Caja de quien tiene la sesión (la asignada, o la primera para el administrador). */
  private readonly miCaja = computed(() => {
    const lista = this.registros();
    const cajaId = this.auth.sesion()?.cajaId;
    return lista.find((r) => r.id === cajaId) ?? lista[0] ?? null;
  });

  /** Fondo que el administrador asignó a la caja. */
  get fondoAsignado(): number {
    return this.fondoManual() ?? this.miCaja()?.fondo ?? 1000;
  }
  set fondoAsignado(valor: number) {
    this.fondoManual.set(valor);
  }

  /** El turno abierto en la caja, sea de quien sea: lo ven el administrador y el corte. */
  readonly turnoDeCaja = computed<Turno | null>(() => {
    const propio = this.turno();
    if (propio) return propio;
    const caja = this.miCaja();
    const t = caja?.abierto;
    return t ? { id: t.id, caja: caja!.nombre, turno: t.turno, desde: t.desde, fondo: t.fondo, usuario: String(t.cajeraId), cajera: t.cajera } : null;
  });

  /** El turno de quien tiene la sesión: con el de otra cajera no se vende ni se cobra. */
  readonly turno = computed<Turno | null>(() => {
    const t = this.mio();
    if (!t) return null;
    return {
      id: t.id,
      caja: t.cash_register?.name ?? this.miCaja()?.nombre ?? 'Caja 01',
      turno: TURNO_DE_API[t.shift] ?? 'Matutino',
      desde: t.opened_at,
      fondo: Number(t.opening_amount),
      usuario: t.cashier ? String(t.cashier.id) : undefined,
      cajera: t.cashier?.name,
    };
  });
  readonly abierta = computed(() => this.turno() !== null);
  /** Turno que otra cajera dejó abierto (salió sin hacer su corte, C1.7). */
  readonly ajeno = computed(() => {
    const t = this.turnoDeCaja();
    return t && !this.turno() ? t : null;
  });
  /** Línea de estado del menú lateral (Figma C1.1 / C1.2). */
  readonly resumen = computed(() => {
    const turno = this.turnoDeCaja();
    if (!turno) return `${this.miCaja()?.nombre ?? 'Caja 01'} · Caja cerrada`;
    return this.ajeno() ? `${turno.caja} · Abierta por ${(turno.cajera ?? '').split(' ')[0]}` : `${turno.caja} · Turno abierto`;
  });

  /** Resumen en vivo de mi turno (lo usa el corte). */
  readonly resumenApi = computed(() => this.mio()?.summary ?? null);

  /** Retiros a gerencia e ingresos de efectivo de mi turno (C10.3). */
  readonly movimientos = computed<MovimientoCaja[]>(() => {
    const t = this.mio();
    return (t?.movements ?? []).map((m) => movimientoDesdeApi(m, t?.cashier?.name));
  });

  // Pagos a proveedor desde caja: se conectan con el módulo de compras.
  private readonly pagos = signal<PagoProveedor[]>([]);
  readonly pagosAProveedor = this.pagos.asReadonly();

  /** Sale del efectivo del turno y aparece en el corte como "Pagos a proveedor" (C7.6). */
  pagarProveedor(pago: Omit<PagoProveedor, 'fecha'>): void {
    this.pagos.update((lista) => [...lista, { ...pago, fecha: new Date().toISOString() }]);
  }

  /** Vuelve a leer las cajas y mi turno (después de vender, retirar o cerrar). */
  refrescar(): void {
    const permisos = this.auth.sesion()?.permisos ?? [];
    if (!permisos.some((p) => ['cash.shift', 'cash.review_closing'].includes(p))) return;

    forkJoin({
      cajas: this.http.get<{ data: { id: number; name: string; default_opening_amount: string | number; open_shift: { id: number; shift: string; opened_at: string; opening_amount: number; cashier: { id: number; name: string } } | null }[] }>(`${this.api}/cash-registers`),
      actual: permisos.includes('cash.shift')
        ? this.http.get<{ data: TurnoApi | null; summary: ResumenTurnoApi | null }>(`${this.api}/cash-shifts/current`)
        : of({ data: null, summary: null }),
    }).subscribe({
      next: ({ cajas, actual }) => {
        this.registros.set(
          cajas.data.map((c) => ({
            id: c.id,
            nombre: c.name,
            fondo: Number(c.default_opening_amount),
            abierto: c.open_shift
              ? {
                  id: c.open_shift.id,
                  turno: TURNO_DE_API[c.open_shift.shift] ?? 'Matutino',
                  desde: c.open_shift.opened_at,
                  fondo: Number(c.open_shift.opening_amount),
                  cajeraId: c.open_shift.cashier.id,
                  cajera: c.open_shift.cashier.name,
                }
              : null,
          })),
        );
        this.mio.set(actual.data ? { ...actual.data, summary: actual.summary ?? undefined } : null);
      },
      error: () => undefined,
    });
  }

  /** C1.3 Abrir turno en la caja elegida, con el fondo contado. */
  abrirTurno(datos: { caja: string; turno: NombreTurno; fondo: number }): Observable<{ ok: boolean; mensaje: string }> {
    const caja = this.registros().find((r) => r.nombre === datos.caja) ?? this.miCaja();
    return this.http
      .post<{ message: string; data: TurnoApi; summary: ResumenTurnoApi }>(`${this.api}/cash-shifts`, {
        cash_register_id: caja?.id ?? null,
        shift: TURNO_A_API[datos.turno],
        opening_amount: datos.fondo,
      })
      .pipe(
        tap((r) => this.mio.set({ ...r.data, summary: r.summary })),
        tap(() => this.refrescar()),
        map((r) => ({ ok: true, mensaje: r.message })),
        catchError((e) => of({ ok: false, mensaje: mensajeDeError(e) })),
      );
  }

  /** C10.3 Retiro o ingreso de efectivo. Devuelve el movimiento con su folio para el comprobante. */
  registrarMovimiento(m: Omit<MovimientoCaja, 'fecha' | 'folio' | 'por'>): Observable<{ ok: true; movimiento: MovimientoCaja } | { ok: false; mensaje: string }> {
    const turno = this.mio();
    if (!turno) return of({ ok: false as const, mensaje: 'Abre tu turno de caja primero.' });

    return this.http
      .post<{ data: TurnoApi; summary: ResumenTurnoApi }>(`${this.api}/cash-shifts/${turno.id}/movements`, {
        type: m.tipo === 'retiro' ? 'cash_out' : 'cash_in',
        amount: m.monto,
        reason: m.comentario ? `${m.motivo}${SEPARADOR}${m.comentario}` : m.motivo,
      })
      .pipe(
        tap((r) => this.mio.set({ ...r.data, summary: r.summary })),
        map((r) => {
          const ultimo = [...(r.data.movements ?? [])].sort((a, b) => b.id - a.id)[0];
          return { ok: true as const, movimiento: movimientoDesdeApi(ultimo, r.data.cashier?.name) };
        }),
        catchError((e) => of({ ok: false as const, mensaje: mensajeDeError(e) })),
      );
  }

  /** Después del corte (C10.4): la caja queda cerrada hasta una nueva apertura. */
  cerrarTurno(): void {
    this.mio.set(null);
    this.refrescar();
  }

  private limpiar(): void {
    this.mio.set(null);
    this.registros.set([]);
    this.fondoManual.set(null);
  }
}
