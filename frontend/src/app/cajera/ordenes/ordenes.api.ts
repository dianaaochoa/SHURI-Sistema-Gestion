import { REGLAS_TALLER } from '../../compartido/reglas-taller';
import type { Concepto, DecisionGarantia, EstadoOrden, Evento, Orden, Prioridad, ReporteGarantia, Tecnico } from './ordenes.service';

/** Orden como la responde la API (ServiceOrderResource, docs/api/endpoints.md §6). */
export interface OrdenApi {
  id: number;
  folio: string;
  status?: { code: string; name: string; color: string; portal_step: number };
  priority: 'low' | 'normal' | 'high' | 'urgent';
  customer?: { id: number; name: string; last_name: string | null; phone: string; email: string | null };
  device?: { id: number; type: string; brand: string; model: string | null; serial_number: string | null; color: string | null; label: string };
  reported_issue: string;
  received_accessories: string | null;
  physical_condition: string | null;
  has_device_pin: boolean;
  device_pin?: string | null;
  diagnosis: string | null;
  failure_cause: string | null;
  labor_level_id?: number | null;
  estimated_minutes?: number | null;
  no_repair_reason: string | null;
  technician?: { id: number; name: string } | null;
  received_by?: string | null;
  is_paused: boolean;
  pause_reason: string | null;
  estimated_cost: number;
  deposit: number;
  total: number;
  is_paid: boolean;
  balance?: { work: number; inspection_fee: number; storage_fee: number; deposit: number; amount_due: number } | null;
  promised_date: string | null;
  created_at: string;
  assigned_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  labor_cost: number;
  parts_cost: number;
  location: 'workshop' | 'counter' | 'storage';
  sent_to_storage_at: string | null;
  storage_fee_waived: boolean;
  warranty_until: string | null;
  picked_up_by_name: string | null;
  delivered_by?: string | null;
  quote?: {
    folio: string;
    type: 'initial' | 'additional' | 'counter';
    status: string;
    diagnosis?: string | null;
    /** Mensaje del jefe para el cliente (J3.2 → P2.4). */
    customer_note?: string | null;
    is_urgent?: boolean;
    created_at?: string | null;
    labor_amount: number;
    parts_amount: number;
    discount: number;
    total: number;
    valid_until: string | null;
    sent_at: string | null;
    answered_at: string | null;
    items: { type: 'part' | 'labor' | 'service' | 'other'; concept: string; quantity: number; unit_price: number }[];
  } | null;
  warranty?: {
    folio: string;
    status: string;
    request_channel: 'portal' | 'counter';
    customer_reason: string;
    ruling: 'covered' | 'not_covered' | 'covered_with_cost' | null;
    ruling_reason: string | null;
    /** Reporte del técnico (T4): JSON con el formulario de la revisión, o texto libre. Solo el personal. */
    technician_review?: string | null;
    technician_id?: number | null;
    extra_cost: number | null;
    extra_cost_accepted: boolean | null;
    created_at: string;
    received_at: string | null;
    ruled_at: string | null;
    finished_at: string | null;
  } | null;
  logs?: { type: string; description: string; visible_to_customer: boolean; user: string | null; created_at: string }[];
  /** Cronómetro del banco: minutos de los tramos cerrados y, si corre, desde cuándo. */
  timer?: { running: boolean; started_at: string | null; worked_minutes: number };
}

/** Lo que solo vive en el navegador por ahora (fotos, estante de bodega, avisos): se conserva al recargar. */
export type ExtrasLocales = Partial<Pick<Orden, 'fotos' | 'evidencias' | 'bodega' | 'contactos' | 'metodoAnticipo'>> & { contrasena?: string };

/** Garantía que sigue en proceso: el equipo está en el taller con el mismo folio. */
const GARANTIA_EN_CURSO = ['requested', 'received', 'in_review', 'awaiting_ruling', 'approved', 'in_repair'];
const GARANTIA_LISTA = ['finished', 'rejected'];
const DICTAMEN: Record<string, string> = {
  requested: 'Solicitada en el portal',
  received: 'En revisión',
  in_review: 'En revisión',
  awaiting_ruling: 'Por dictaminar',
  approved: 'Aplica',
  rejected: 'No aplica',
  in_repair: 'En reparación',
  finished: 'Terminada',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
};
const TIPO_DICTAMEN: Record<string, DecisionGarantia['tipo']> = { covered: 'aplica', covered_with_cost: 'con-costo', not_covered: 'sin-reparar' };
const PRIORIDAD: Record<OrdenApi['priority'], Prioridad> = { low: 'normal', normal: 'normal', high: 'alta', urgent: 'urgente' };
const TIPO_CONCEPTO: Record<string, Concepto['tipo']> = { part: 'refaccion', labor: 'mano-obra' };

/**
 * Técnico de una orden recién recibida. Las pantallas lo comparan por referencia
 * (`o.tecnico === POR_ASIGNAR`), así que todas las órdenes sin técnico usan este mismo objeto.
 */
export const POR_ASIGNAR: Tecnico = { iniciales: '—', nombre: 'Por asignar (jefe de taller)' };

/** Nota interna del taller (no la ve el cliente): no se repite en el historial. */
const esNotaInterna = (l: { type: string; visible_to_customer: boolean }) => l.type === 'note' && !l.visible_to_customer;
const TRABAJO_REALIZADO = 'Trabajo realizado: ';
/** Así queda en la bitácora la confirmación del jefe (QuoteService::NO_REPAIR_CONFIRMED). */
const SIN_REPARACION_CONFIRMADA = 'Sin reparación confirmada por el jefe de taller';
/** Niveles del tabulador (labor_levels): el front los nombra en el texto "nivel medio". */
export const NIVELES_MANO_OBRA: Record<number, string> = { 2: 'bajo', 3: 'medio', 4: 'alto' };
const DEVUELTO_A_CAJA = 'Equipo armado y devuelto a caja sin reparar.';
/** Hasta que el técnico termina el diagnóstico la orden no está "por cotizar" (J2). */
const SIN_DIAGNOSTICO = ['received', 'assigned', 'diagnosing'];

/** "OS-2026-00012" → "#OS-2026-00012": las pantallas usan el "#" y lo quitan para las URLs. */
export const folioDeApi = (folio: string) => `#${folio}`;
export const folioParaApi = (folio: string) => folio.replace('#', '');

/** "8711234567" → "871 123 4567" */
export const telefonoLegible = (tel: string) => (/^\d{10}$/.test(tel) ? `${tel.slice(0, 3)} ${tel.slice(3, 6)} ${tel.slice(6)}` : tel);

export function tecnicoDeApi(t: { id: number; name: string }): Tecnico {
  const partes = t.name.trim().split(/\s+/);
  const iniciales = ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? partes[0]?.[1] ?? '')).toUpperCase();
  return { id: t.id, iniciales, nombre: t.name };
}

/** Estado de la API → estado de las pantallas (C4, J2, T2). */
export function estadoDeApi(o: OrdenApi): EstadoOrden {
  const codigo = o.status?.code ?? 'received';
  const w = o.warranty;

  if (codigo === 'delivered') {
    if (w && GARANTIA_EN_CURSO.includes(w.status)) return 'en-garantia';
    if (w && GARANTIA_LISTA.includes(w.status)) return 'garantia-lista';
    const sinReparar = o.quote?.status === 'rejected' || !!o.no_repair_reason;
    return sinReparar ? 'sin-reparar-entregada' : 'terminada';
  }
  if (codigo === 'cancelled') return 'sin-reparar-entregada';
  if (codigo === 'abandoned' || codigo === 'disposed') return 'bodega';
  // Reportada sin reparación: sigue en el taller hasta que el jefe la confirma (J3.3)
  if (codigo === 'not_repairable' && !(o.logs ?? []).some((l) => l.description.startsWith(SIN_REPARACION_CONFIRMADA))) return 'por-cotizar';
  if (['ready_for_pickup', 'not_repairable', 'quote_rejected'].includes(codigo)) {
    if (o.location === 'storage') return 'bodega';
    if (codigo !== 'ready_for_pickup') return 'sin-reparacion';
    const dias = o.ready_at ? (Date.now() - new Date(o.ready_at).getTime()) / 86_400_000 : 0;
    return dias > REGLAS_TALLER.diasSinCobro ? 'vencida' : 'lista';
  }
  if (codigo === 'quote_pending') return o.quote?.type === 'additional' ? 'adicional' : 'por-aprobar';
  if (codigo === 'in_repair') return o.is_paused && /refacci/i.test(o.pause_reason ?? '') ? 'esperando-refaccion' : 'en-taller';
  return 'por-cotizar';
}

function conceptos(items: NonNullable<OrdenApi['quote']>['items']): Concepto[] {
  return items.map((i) => ({ tipo: TIPO_CONCEPTO[i.type] ?? 'otro', descripcion: i.concept, cantidad: i.quantity, costo: 0, precio: i.unit_price }));
}

/**
 * Reporte de daño adicional del técnico: "Flex roto\nPropuesta: 1 × Flex de pantalla, 2 × Tornillo".
 * Devuelve el texto y los conceptos para que el jefe ponga precios (J3.4), más la mano de obra adicional.
 */
function propuesta(texto: string): { texto: string; conceptos: Concepto[] } {
  const [reporte, ...resto] = texto.split('\nPropuesta: ');
  const piezas = (resto.join('') || '')
    .split(', ')
    .map((p) => /^(\d+) × (.+)$/.exec(p.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m): Concepto => ({ tipo: 'otro', descripcion: m[2], cantidad: Number(m[1]), costo: 0, precio: 0 }));
  return {
    texto: reporte.trim(),
    conceptos: [...(piezas.length ? piezas : [{ tipo: 'otro' as const, descripcion: 'Reparación del daño adicional', cantidad: 1, costo: 0, precio: 0 }]), { tipo: 'mano-obra', descripcion: 'Mano de obra adicional', cantidad: 1, costo: 0, precio: 0 }],
  };
}

/**
 * Reporte de la revisión de garantía (T4 → J4.2). El banco lo manda como JSON con los campos del
 * formulario; si alguien lo escribió como texto libre, se muestra completo como hallazgo.
 */
function reporteDeApi(w: NonNullable<OrdenApi['warranty']>): ReporteGarantia | undefined {
  if (!w.technician_review) return undefined;
  const fecha = w.ruled_at ?? w.received_at ?? w.created_at;
  try {
    const r = JSON.parse(w.technician_review) as Partial<ReporteGarantia>;
    if (r && typeof r === 'object' && r.hallazgo) {
      return { fecha, hallazgo: r.hallazgo, relacion: r.relacion ?? '', malUso: r.malUso ?? '', trabajo: r.trabajo ?? '', recomienda: r.recomienda === 'no-aplica' ? 'no-aplica' : 'aplica', motivo: r.motivo ?? '', costo: r.costo };
    }
  } catch {
    // Texto libre
  }
  return { fecha, hallazgo: w.technician_review, relacion: '', malUso: '', trabajo: '', recomienda: 'aplica', motivo: '' };
}

function ultimoLog(o: OrdenApi, tipo: string): string | undefined {
  return [...(o.logs ?? [])].reverse().find((l) => l.type === tipo)?.created_at;
}

/** Convierte la orden de la API al modelo que usan todas las pantallas. */
export function ordenDeApi(o: OrdenApi, extras: ExtrasLocales = {}): Orden {
  const estado = estadoDeApi(o);
  const q = o.quote;
  const w = o.warranty;
  const logs = o.logs ?? [];
  const trabajo = o.labor_cost + o.parts_cost;

  // Presupuesto inicial (el que aprobó o tiene por aprobar el cliente)
  const presupuesto: Orden['presupuesto'] =
    q && q.sent_at && q.type !== 'additional'
      ? {
          enviado: q.sent_at,
          descripcion: q.customer_note || o.diagnosis || q.items.map((i) => i.concept).join(', '),
          refacciones: q.parts_amount,
          manoObra: q.labor_amount,
          total: q.total,
          aprobado: q.status === 'approved' ? (q.answered_at ?? undefined) : undefined,
          conceptos: conceptos(q.items),
          descuento: q.discount,
        }
      : q?.type === 'additional' && trabajo > 0
        ? { enviado: o.assigned_at ?? o.created_at, descripcion: o.diagnosis ?? '', refacciones: o.parts_cost, manoObra: o.labor_cost, total: trabajo, aprobado: o.assigned_at ?? undefined }
        : undefined;

  const adicional: Orden['adicional'] =
    q?.type === 'additional' && q.status === 'pending' && q.sent_at ? { enviado: q.sent_at, descripcion: q.items.map((i) => i.concept).join(', '), monto: q.total } : undefined;

  const decision: DecisionGarantia | undefined =
    w?.ruling
      ? {
          fecha: w.ruled_at ?? w.created_at,
          tipo: TIPO_DICTAMEN[w.ruling],
          texto: w.ruling_reason ?? '',
          costo: w.extra_cost ?? undefined,
          por: 'Jefe de taller',
          respuesta: w.extra_cost_accepted === null ? undefined : { fecha: w.ruled_at ?? w.created_at, acepta: w.extra_cost_accepted },
        }
      : undefined;

  const inspeccion = o.balance?.inspection_fee ?? 0;
  const almacenaje = o.balance?.storage_fee ?? 0;
  const historial: Evento[] = logs.filter((l) => !esNotaInterna(l)).map((l) => ({ fecha: l.created_at, texto: l.description }));
  const notas: Evento[] = logs.filter(esNotaInterna).map((l) => ({ fecha: l.created_at, texto: l.user ? `${l.user}: ${l.description}` : l.description }));
  const realizado = [...logs].reverse().find((l) => l.description.startsWith(TRABAJO_REALIZADO))?.description.slice(TRABAJO_REALIZADO.length);
  const devuelto = [...logs].reverse().find((l) => l.description === DEVUELTO_A_CAJA)?.created_at;
  const confirmada = logs.find((l) => l.description.startsWith(SIN_REPARACION_CONFIRMADA));
  const nivel = o.labor_level_id ? NIVELES_MANO_OBRA[o.labor_level_id] : undefined;
  // Daño adicional que el técnico reportó y el jefe todavía no cotiza (J3.4)
  const danoAdicional: Orden['danoAdicional'] =
    q?.type === 'additional' && q.status === 'to_quote' ? { fecha: q.created_at ?? o.created_at, urgente: !!q.is_urgent, ...propuesta(q.diagnosis ?? '') } : undefined;
  const avisos: Evento[] = logs.filter((l) => l.type === 'email').map((l) => ({ fecha: l.created_at, texto: l.description }));
  const nombre = [o.customer?.name, o.customer?.last_name].filter(Boolean).join(' ');

  return {
    id: o.id,
    folio: folioDeApi(o.folio),
    recibido: o.created_at,
    cliente: { nombre, telefono: telefonoLegible(o.customer?.phone ?? ''), correo: o.customer?.email ?? undefined },
    clienteId: o.customer?.id,
    equipo: `${o.device?.brand === 'Apple' ? '' : (o.device?.brand ?? '')} ${o.device?.model ?? ''}`.trim() || (o.device?.type ?? ''),
    imei: o.device?.serial_number ?? '',
    tecnico: o.technician ? tecnicoDeApi(o.technician) : POR_ASIGNAR,
    estado,
    trabajo: o.reported_issue,
    presupuesto,
    adicional,
    anticipo: o.deposit,
    metodoAnticipo: extras.metodoAnticipo,
    listaDesde: o.ready_at ?? undefined,
    entrega: o.delivered_at
      ? { fecha: o.delivered_at, por: o.delivered_by ?? '', pagado: o.total || trabajo, recogio: o.picked_up_by_name ?? undefined }
      : undefined,
    accesorios: o.received_accessories || 'Ninguno',
    realizado: realizado ?? (confirmada ? confirmada.description.replace(/^[^.]*\.\s*/, '') || undefined : undefined),
    presupuestoFolio: q?.folio,
    porCobrar: o.balance ? o.balance.amount_due : undefined,
    danoAdicional,
    devueltoACaja: devuelto,
    cronometro: o.timer ? { corriendo: o.timer.running, desde: o.timer.started_at ?? undefined, minutos: o.timer.worked_minutes } : undefined,
    rechazo: q?.status === 'rejected' ? (q.answered_at ?? undefined) : undefined,
    garantia: w
      ? {
          folio: w.folio,
          estadoApi: w.status,
          recibida: w.received_at ?? w.created_at,
          falla: w.customer_reason,
          dictamen: DICTAMEN[w.status] ?? w.status,
          resolucion: w.ruling_reason ?? '',
          recibio: w.request_channel === 'counter' ? 'Mostrador' : undefined,
          reporte: reporteDeApi(w),
          decision,
        }
      : undefined,
    ficha: {
      tipo: o.device?.type ?? '',
      marca: o.device?.brand ?? '',
      modelo: o.device?.model ?? '',
      color: o.device?.color ?? '',
      condicion: o.physical_condition ?? '',
      recibio: o.received_by ?? '',
      falla: o.reported_issue,
      contrasena: extras.contrasena,
      pin: o.device_pin ?? undefined,
    },
    fotos: extras.fotos,
    evidencias: extras.evidencias,
    prioridad: PRIORIDAD[o.priority] ?? 'normal',
    prometida: o.promised_date ?? undefined,
    diagnostico:
      // El "sin reparación" sin confirmar va en su propia lista de J3, no en "Por cotizar"
      o.diagnosis && !SIN_DIAGNOSTICO.includes(o.status?.code ?? 'received') && !(o.status?.code === 'not_repairable' && !confirmada)
        ? {
            fecha: ultimoLog(o, 'diagnosis') ?? o.assigned_at ?? o.created_at,
            texto: o.diagnosis,
            causa: o.failure_cause ?? undefined,
            // El jefe parte de la mano de obra que eligió el técnico (J3.2); el precio sale del tabulador
            conceptos: nivel ? [{ tipo: 'mano-obra', descripcion: 'Mano de obra', detalle: `${o.estimated_minutes ?? 60} min · nivel ${nivel}`, cantidad: 1, costo: 0, precio: 0 }] : [],
          }
        : undefined,
    // "Sin reparación" espera al jefe (J3.3) hasta que lo confirma
    sinReparacion: o.status?.code === 'not_repairable' && !confirmada ? { fecha: ultimoLog(o, 'diagnosis') ?? o.created_at, motivo: o.no_repair_reason ?? '', texto: o.diagnosis ?? o.no_repair_reason ?? '' } : undefined,
    almacenaje: o.storage_fee_waived ? { dias: 0, monto: 0, por: 'Jefe de taller', perdonado: true } : almacenaje > 0 ? { dias: 0, monto: almacenaje, por: 'Política de bodega' } : undefined,
    revision: estado === 'sin-reparacion' ? { cobrar: inspeccion > 0, monto: inspeccion } : undefined,
    pausa: o.is_paused ? { desde: ultimoLog(o, 'pause') ?? o.created_at, motivo: o.pause_reason ?? '', detalle: '' } : undefined,
    notas: notas.length ? notas : undefined,
    bodega: o.location === 'storage' ? (extras.bodega ?? { ubicacion: 'Bodega', estante: '', enviado: o.sent_to_storage_at ?? o.created_at, por: '' }) : undefined,
    historial,
    // Los avisos locales que ya vienen de la API no se repiten
    contactos: [...avisos, ...(extras.contactos ?? []).filter((c) => !avisos.some((a) => a.fecha === c.fecha && a.texto === c.texto))],
  };
}
