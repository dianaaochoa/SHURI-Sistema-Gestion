import { REGLAS_TALLER } from '../../compartido/reglas-taller';
import type { Concepto, DecisionGarantia, EstadoOrden, Evento, Orden, Prioridad, Tecnico } from './ordenes.service';

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
    extra_cost: number | null;
    extra_cost_accepted: boolean | null;
    created_at: string;
    received_at: string | null;
    ruled_at: string | null;
    finished_at: string | null;
  } | null;
  logs?: { type: string; description: string; visible_to_customer: boolean; user: string | null; created_at: string }[];
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
          descripcion: o.diagnosis ?? q.items.map((i) => i.concept).join(', '),
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
  const historial: Evento[] = logs.map((l) => ({ fecha: l.created_at, texto: l.description }));
  const notas: Evento[] = logs.filter((l) => !l.visible_to_customer).map((l) => ({ fecha: l.created_at, texto: l.user ? `${l.user}: ${l.description}` : l.description }));
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
    tecnico: o.technician ? tecnicoDeApi(o.technician) : { iniciales: '—', nombre: 'Por asignar (jefe de taller)' },
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
    rechazo: q?.status === 'rejected' ? (q.answered_at ?? undefined) : undefined,
    garantia: w
      ? {
          recibida: w.received_at ?? w.created_at,
          falla: w.customer_reason,
          dictamen: DICTAMEN[w.status] ?? w.status,
          resolucion: w.ruling_reason ?? '',
          recibio: w.request_channel === 'counter' ? 'Mostrador' : undefined,
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
    diagnostico: o.diagnosis ? { fecha: ultimoLog(o, 'diagnosis') ?? o.assigned_at ?? o.created_at, texto: o.diagnosis, causa: o.failure_cause ?? undefined } : undefined,
    sinReparacion: o.status?.code === 'not_repairable' ? { fecha: o.ready_at ?? o.created_at, motivo: o.no_repair_reason ?? '', texto: o.no_repair_reason ?? '' } : undefined,
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
