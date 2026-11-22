import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../acceso/auth.service';
import { erroresDeCampos, mensajeDeError } from '../../api/errores-api';
import { Orden, OrdenesService } from '../ordenes/ordenes.service';
import { Cliente, Direccion } from '../punto-de-venta/clientes.datos';
import { VentaRegistrada } from '../ventas/historial-ventas.service';

export type TipoMovimiento = 'Compra' | 'Equipo' | 'Garantía';

/** Un renglón del historial del cliente (Figma C8.3). */
export interface MovimientoCliente {
  fecha: string;
  tipo: TipoMovimiento;
  folio: string;
  descripcion: string;
  /** null = sin costo. */
  monto: number | null;
  /** Lo que ya pagó por este renglón (cuenta para "Total gastado"). */
  pagado: number;
  estado: { texto: string; tono: string };
  /** Orden que se puede abrir en Órdenes de servicio. */
  orden?: string;
}

export interface ResumenCliente {
  cliente: Cliente;
  equipos: { texto: string; tono: string; categoria: string } | null;
  ultimaVisita: string | null;
  total: number;
  visitas: number;
}

/** Resultado de guardar un cliente: el cliente como quedó en la API, o los errores por campo. */
export type ResultadoCliente = { ok: true; cliente: Cliente } | { ok: false; mensaje: string; errores: Record<string, string> };

/** Cliente como lo responde la API (GET /customers, docs/api/endpoints.md §5). */
interface ClienteApi {
  id: number;
  name: string;
  last_name: string | null;
  phone: string;
  email: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  notes: string | null;
  created_at: string | null;
  has_portal_password: boolean;
  portal_temporary_expires_at: string | null;
  summary?: { active_orders: string[]; last_visit: string | null; total_spent: number; visits: number };
}

interface HistorialApi {
  orders: {
    folio: string;
    created_at: string;
    device: string;
    reported_issue: string;
    diagnosis: string | null;
    total: number;
    deposit: number;
    is_paid: boolean;
    status: { code: string; name: string };
    warranties: { folio: string; created_at: string; reason: string; status: string; extra_cost: number | null }[];
  }[];
  sales: { folio: string; paid_at: string; items: { type: string; description: string; quantity: number }[]; total: number; status: string }[];
}

/** Cómo se resume un equipo activo en la lista (Figma C8: "1 en taller", "1 listo", "1 por devolver"). */
const CATEGORIAS: Record<string, { texto: string; tono: string; prioridad: number }> = {
  ready_for_pickup: { texto: 'listo', tono: 'exito', prioridad: 1 },
  quote_pending: { texto: 'por aprobar', tono: 'advertencia', prioridad: 2 },
  awaiting_customer: { texto: 'por aprobar', tono: 'advertencia', prioridad: 2 },
  not_repairable: { texto: 'por devolver', tono: 'peligro', prioridad: 3 },
  quote_rejected: { texto: 'por devolver', tono: 'peligro', prioridad: 3 },
  abandoned: { texto: 'en bodega', tono: 'peligro', prioridad: 3 },
  received: { texto: 'en taller', tono: 'info', prioridad: 4 },
  assigned: { texto: 'en taller', tono: 'info', prioridad: 4 },
  diagnosing: { texto: 'en taller', tono: 'info', prioridad: 4 },
  quoting: { texto: 'en taller', tono: 'info', prioridad: 4 },
  in_repair: { texto: 'en taller', tono: 'info', prioridad: 4 },
};

/** Color de la etiqueta de estado de una orden en el historial. */
const TONO_ESTADO: Record<string, string> = {
  ready_for_pickup: 'exito', delivered: 'neutro', quote_pending: 'advertencia', awaiting_customer: 'advertencia',
  not_repairable: 'peligro', quote_rejected: 'peligro', abandoned: 'peligro', disposed: 'neutro', cancelled: 'neutro',
};
const VENTA_ESTADO: Record<string, { texto: string; tono: string }> = {
  paid: { texto: 'Pagada', tono: 'exito' },
  partially_returned: { texto: 'Devolución parcial', tono: 'advertencia' },
  returned: { texto: 'Devuelta', tono: 'neutro' },
  cancelled: { texto: 'Cancelada', tono: 'neutro' },
};

const digitos = (t?: string) => (t ?? '').replace(/\D/g, '');
const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
/** "8711112222" → "871 111 2222" */
const telefono = (t: string) => (t.length === 10 ? `${t.slice(0, 3)} ${t.slice(3, 6)} ${t.slice(6)}` : t);

/** "Hoy", "Ayer" o "8 oct" (Figma C8, columna Última visita). */
export function visita(iso: string | null): string {
  if (!iso) return '—';
  const dias = Math.round((new Date(new Date().toDateString()).getTime() - new Date(new Date(iso).toDateString()).getTime()) / 86_400_000);
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  const f = new Date(iso);
  const mes = f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');
  return f.getFullYear() === new Date().getFullYear() ? `${f.getDate()} ${mes}` : `${f.getDate()} ${mes} ${f.getFullYear()}`;
}

/** "Mica, cargador, cable y funda": la primera palabra de cada producto. */
export function descripcionVenta(venta: Pick<VentaRegistrada, 'lineas'>): string {
  return descripcionDe(venta.lineas.map((l) => l.nombre));
}

function descripcionDe(nombres: string[]): string {
  const palabras = [...new Set(nombres.map((n) => n.split(' ')[0].toLowerCase()))];
  const texto = palabras.length > 1 ? `${palabras.slice(0, -1).join(', ')} y ${palabras.at(-1)}` : palabras[0] ?? '';
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function clienteDesdeApi(c: ClienteApi): Cliente {
  return {
    id: String(c.id),
    nombre: [c.name, c.last_name].filter(Boolean).join(' '),
    telefono: telefono(c.phone),
    correo: c.email,
    direccion: c.address || c.city || c.postal_code ? { pais: 'México', estado: '', ciudad: c.city ?? '', cp: c.postal_code ?? '', calle: c.address ?? '', exterior: '', interior: '' } : undefined,
    comentarios: c.notes ?? undefined,
    desde: c.created_at ?? undefined,
    portal: c.has_portal_password
      ? { tipo: 'personalizada', fecha: c.created_at ?? new Date().toISOString() }
      : c.portal_temporary_expires_at
        ? { tipo: 'temporal', fecha: c.portal_temporary_expires_at }
        : undefined,
  };
}

/** "Av. Morelos 456 Int. 3" para el campo address de la API. */
function calleCompleta(d?: Direccion): string | null {
  if (!d) return null;
  const texto = [d.calle, d.exterior, d.interior ? `Int. ${d.interior}` : '', d.estado].filter((x) => x?.trim()).join(' ').trim();
  return texto || null;
}

/** Cuerpo de POST/PUT /customers: el nombre completo se separa en nombre y apellidos. */
function cuerpoCliente(c: Cliente): Record<string, unknown> {
  const [nombre, ...apellidos] = c.nombre.trim().split(/\s+/);
  return {
    name: nombre,
    last_name: apellidos.join(' ') || null,
    phone: digitos(c.telefono),
    email: c.correo?.trim(),
    address: calleCompleta(c.direccion),
    city: c.direccion?.ciudad?.trim() || null,
    postal_code: c.direccion?.cp?.trim() || null,
    notes: c.comentarios?.trim() || null,
  };
}

/** Errores de la API con los nombres de campo del formulario (nombre, telefono, correo). */
function erroresCliente(e: unknown): Record<string, string> {
  const api = erroresDeCampos(e);
  return {
    ...(api['name'] ? { nombre: api['name'] } : {}),
    ...(api['phone'] ? { telefono: api['phone'] } : {}),
    ...(api['email'] ? { correo: api['email'] } : {}),
    ...(api['postal_code'] ? { cp: api['postal_code'] } : {}),
  };
}

/** Registro de clientes (C8) conectado a la API: lista con su resumen, historial, alta y edición. */
@Injectable({ providedIn: 'root' })
export class ClientesService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly auth = inject(AuthService);
  private readonly ordenes = inject(OrdenesService);

  private readonly lista = signal<ClienteApi[]>([]);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  /** Historial de cada cliente (se carga al abrir su ficha). */
  private readonly historiales = signal<Record<string, MovimientoCliente[]>>({});

  constructor() {
    effect(() => {
      const sesion = this.auth.sesion();
      untracked(() => (sesion ? this.cargar() : this.lista.set([])));
    });
  }

  /** Todos los clientes registrados. */
  readonly clientes = computed<Cliente[]>(() => this.lista().map(clienteDesdeApi));

  /** Lo que muestra la lista: equipos activos, última visita y total gastado. */
  readonly resumenes = computed<ResumenCliente[]>(() =>
    this.lista().map((c) => {
      const activos = (c.summary?.active_orders ?? []).map((code) => CATEGORIAS[code]).filter((x): x is NonNullable<typeof x> => !!x);
      let equipos: ResumenCliente['equipos'] = null;
      if (activos.length) {
        const principal = activos.reduce((a, b) => (b.prioridad < a.prioridad ? b : a));
        const mismos = activos.filter((a) => a.texto === principal.texto).length;
        const otros = activos.length - mismos;
        equipos = { texto: `${mismos} ${principal.texto}${otros ? ` +${otros}` : ''}`, tono: principal.tono, categoria: principal.texto };
      }
      return {
        cliente: clienteDesdeApi(c),
        equipos,
        ultimaVisita: c.summary?.last_visit ?? null,
        total: c.summary?.total_spent ?? 0,
        visitas: c.summary?.visits ?? 0,
      };
    }),
  );

  cargar(): void {
    const permisos = this.auth.sesion()?.permisos ?? [];
    if (!permisos.some((p) => ['customers.manage', 'orders.receive'].includes(p))) return;
    this.cargando.set(true);
    this.http.get<{ data: ClienteApi[] }>(`${this.api}/customers`).subscribe({
      next: (r) => {
        this.lista.set(r.data);
        this.error.set(null);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  buscar(id: string): Cliente | undefined {
    return this.clientes().find((c) => c.id === id);
  }

  private esMismo(a: Pick<Cliente, 'id' | 'nombre' | 'telefono'>, b: Pick<Cliente, 'id' | 'nombre' | 'telefono'>): boolean {
    if (a.id === b.id) return true;
    const ta = digitos(a.telefono);
    if (ta && ta === digitos(b.telefono)) return true;
    return normal(a.nombre) === normal(b.nombre);
  }

  /** Órdenes del cliente en la lista de Órdenes de servicio (se conecta con ese módulo). */
  ordenesDe(c: Cliente): Orden[] {
    return this.ordenes
      .ordenes()
      // Las órdenes de la API traen el id del cliente; las de prueba se relacionan por nombre y teléfono
      .filter((o) => (o.clienteId ? String(o.clienteId) === c.id : this.esMismo(c, { id: '', nombre: o.cliente.nombre, telefono: o.cliente.telefono })))
      .sort((a, b) => b.recibido.localeCompare(a.recibido));
  }

  /** Todo lo que ha hecho el cliente, del más reciente al más antiguo (se carga con `cargarHistorial`). */
  historial(c: Cliente): MovimientoCliente[] {
    return this.historiales()[c.id] ?? [];
  }

  /** C8.3 Trae de la API los equipos (con garantías) y las compras del cliente. */
  cargarHistorial(id: string): void {
    if (!/^\d+$/.test(id)) return;
    this.http.get<{ history: HistorialApi }>(`${this.api}/customers/${id}`).subscribe({
      next: ({ history }) => {
        const equipos: MovimientoCliente[] = history.orders.flatMap((o) => [
          {
            fecha: o.created_at,
            tipo: 'Equipo' as const,
            folio: o.folio,
            descripcion: `${o.device} · ${o.diagnosis || o.reported_issue}`,
            monto: o.total || null,
            pagado: o.is_paid ? o.total : o.deposit,
            estado: { texto: o.status.name, tono: TONO_ESTADO[o.status.code] ?? 'info' },
            orden: o.folio,
          },
          ...o.warranties.map((w) => ({
            fecha: w.created_at,
            tipo: 'Garantía' as const,
            folio: w.folio,
            descripcion: `${o.device} · ${w.reason}`,
            monto: w.extra_cost,
            pagado: 0,
            estado: { texto: w.status === 'delivered' ? 'Entregada' : 'En garantía', tono: w.status === 'delivered' ? 'neutro' : 'info' },
            orden: o.folio,
          })),
        ]);
        const compras: MovimientoCliente[] = history.sales
          .filter((s) => !s.items.some((i) => i.type === 'service_order'))
          .map((s) => ({
            fecha: s.paid_at,
            tipo: 'Compra' as const,
            folio: s.folio,
            descripcion: descripcionDe(s.items.map((i) => i.description)),
            monto: s.total,
            pagado: s.status === 'cancelled' ? 0 : s.total,
            estado: VENTA_ESTADO[s.status] ?? { texto: s.status, tono: 'neutro' },
          }));
        const todos = [...equipos, ...compras].sort((a, b) => b.fecha.localeCompare(a.fecha));
        this.historiales.update((h) => ({ ...h, [id]: todos }));
      },
      error: () => undefined,
    });
  }

  /**
   * Alta (id que no es de la API) o edición. La petición se manda aunque quien llama no se
   * suscriba; quien necesite el resultado (errores por campo, id nuevo) se suscribe.
   */
  guardar(cliente: Cliente): Observable<ResultadoCliente> {
    const esNuevo = !/^\d+$/.test(cliente.id);
    const peticion = esNuevo
      ? this.http.post<{ data: ClienteApi }>(`${this.api}/customers`, cuerpoCliente(cliente))
      : this.http.put<{ data: ClienteApi }>(`${this.api}/customers/${cliente.id}`, cuerpoCliente(cliente));

    const resultado = peticion.pipe(
      map((r): ResultadoCliente => ({ ok: true, cliente: clienteDesdeApi(r.data) })),
      tap((r) => {
        if (r.ok) this.cargar();
      }),
      catchError((e) => of<ResultadoCliente>({ ok: false, mensaje: mensajeDeError(e), errores: erroresCliente(e) })),
      shareReplay(1),
    );
    resultado.subscribe();
    return resultado;
  }

  /** C8.4: nueva contraseña temporal del portal; la anterior deja de funcionar. */
  generarTemporal(cliente: Cliente): Observable<{ ok: true; temporal: string } | { ok: false; mensaje: string }> {
    return this.http.post<{ temporary_password: string }>(`${this.api}/customers/${cliente.id}/temporary-password`, {}).pipe(
      map((r) => ({ ok: true as const, temporal: r.temporary_password })),
      tap(() => this.cargar()),
      catchError((e) => of({ ok: false as const, mensaje: mensajeDeError(e) })),
    );
  }
}
