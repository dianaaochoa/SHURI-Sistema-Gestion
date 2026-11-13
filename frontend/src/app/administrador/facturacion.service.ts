import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../acceso/auth.service';
import { redondear } from '../cajera/punto-de-venta/venta.service';
import { HistorialVentasService } from '../cajera/ventas/historial-ventas.service';

export type EstadoCfdi = 'timbrada' | 'cancelada' | 'error';
export type QuienPidio = 'Caja' | 'Autofactura' | 'Admin';
export type MotivoCancelacion = '01' | '02' | '03';

/** Motivos de cancelación del SAT (Figma AD6.2). */
export const MOTIVOS_CANCELACION: Record<MotivoCancelacion, { texto: string; detalle: string }> = {
  '01': { texto: '01 · Con errores, con relación', detalle: 'Se emite una nueva factura que la sustituye' },
  '02': { texto: '02 · Con errores, sin relación', detalle: 'Datos incorrectos sin factura nueva' },
  '03': { texto: '03 · No se llevó a cabo la operación', detalle: 'Venta cancelada o devuelta' },
};

export const ESTADOS_CFDI: Record<EstadoCfdi, { texto: string; tono: string }> = {
  timbrada: { texto: 'Timbrada', tono: 'exito' },
  cancelada: { texto: 'Cancelada', tono: 'peligro' },
  error: { texto: 'Error', tono: 'advertencia' },
};

export const RFC_PUBLICO = 'XAXX010101000';

export interface Cfdi {
  serie: string;
  folio: number;
  /** ISO */
  fecha: string;
  cliente: string;
  rfc: string;
  /** "Venta V-00862", "Orden #1023" o "Global oct". */
  origen: string;
  total: number;
  pidio: QuienPidio;
  estado: EstadoCfdi;
  uuid: string;
  /** Factura global: mes que cubre ("2026-10"). */
  global?: string;
  /** Folio de la factura a la que sustituye (motivo 01). */
  sustituye?: string;
  cancelacion?: { motivo: MotivoCancelacion; fecha: string; por: string; sustituta?: string };
}

export const serieFolio = (c: Pick<Cfdi, 'serie' | 'folio'>) => `${c.serie}-${String(c.folio).padStart(4, '0')}`;

/** "Hoy", "Ayer" o "15 oct". */
export function diaFactura(iso: string): string {
  const f = new Date(iso);
  const hoy = new Date();
  const dias = Math.round((new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime() - new Date(f.getFullYear(), f.getMonth(), f.getDate()).getTime()) / 86_400_000);
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  return `${f.getDate()} ${f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;
}

const DIA = 86_400_000;
const hace = (dias: number, hora = 12) => {
  const d = new Date(Date.now() - dias * DIA);
  d.setHours(hora, 0, 0, 0);
  return d.toISOString();
};
const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16).toUpperCase();
  });

/** Las facturas de Figma AD6.1, con fechas relativas a hoy. */
function demo(totalV862: number): Cfdi[] {
  const anterior = new Date();
  anterior.setDate(0);
  const mesGlobal = new Date(anterior.getFullYear(), anterior.getMonth() - 1, 1);
  const idGlobal = `${mesGlobal.getFullYear()}-${String(mesGlobal.getMonth() + 1).padStart(2, '0')}`;
  const corto = mesGlobal.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');
  const base = { serie: 'A', estado: 'timbrada' as EstadoCfdi };
  return [
    { ...base, folio: 412, fecha: hace(0, 13), cliente: 'María Hernández', rfc: 'HEMM850312QX4', origen: 'Venta V-00862', total: totalV862, pidio: 'Caja', uuid: uuid() },
    { ...base, folio: 411, fecha: hace(0, 10), cliente: 'Héctor Ramos', rfc: 'RAHH870615T52', origen: 'Orden #1023', total: 1160, pidio: 'Autofactura', uuid: uuid() },
    { ...base, folio: 410, fecha: hace(3), cliente: 'Comercial Lomas SA', rfc: 'CLO120415PL8', origen: 'Venta V-00849', total: 4320, pidio: 'Caja', uuid: uuid() },
    {
      ...base,
      folio: 409,
      fecha: hace(4),
      cliente: 'Pedro Núñez',
      rfc: 'NUPP881120KJ3',
      origen: 'Venta V-00845',
      total: 950,
      pidio: 'Autofactura',
      uuid: uuid(),
      estado: 'cancelada',
      cancelacion: { motivo: '03', fecha: hace(3, 17), por: 'Verónica Castillo' },
    },
    { ...base, folio: 408, fecha: new Date(anterior.getFullYear(), anterior.getMonth(), 2, 11).toISOString(), cliente: 'Público en general', rfc: RFC_PUBLICO, origen: `Global ${corto}`, total: 61240, pidio: 'Admin', uuid: uuid(), global: idGlobal },
  ];
}

/**
 * AD6 · Facturas (CFDI 4.0) del negocio. Simulado en memoria: al conectar la API, el timbrado lo hace el PAC.
 * Las ventas con factura (C2.18) y las entregas con factura (C6) se timbran aquí.
 */
@Injectable({ providedIn: 'root' })
export class FacturacionService {
  private readonly auth = inject(AuthService);

  readonly facturas = signal<Cfdi[]>(demo(inject(HistorialVentasService).ventas().find((v) => v.folio === 'V-00862')?.total ?? 899));
  /** Paquete de timbres contratado y los que quedan. */
  readonly paquete = 500;
  readonly timbres = signal(436);

  readonly siguienteFolio = computed(() => Math.max(0, ...this.facturas().map((f) => f.folio)) + 1);

  /** Timbra una factura nueva (gasta un timbre) y regresa su serie-folio. */
  timbrar(datos: Pick<Cfdi, 'cliente' | 'rfc' | 'origen' | 'total' | 'pidio'> & Partial<Pick<Cfdi, 'global' | 'sustituye'>>): string {
    const nueva: Cfdi = { ...datos, serie: 'A', folio: this.siguienteFolio(), fecha: new Date().toISOString(), estado: 'timbrada', uuid: uuid(), total: redondear(datos.total) };
    this.facturas.update((lista) => [nueva, ...lista]);
    this.timbres.update((t) => Math.max(0, t - 1));
    return serieFolio(nueva);
  }

  /** AD6.2 · Cancela ante el SAT; con motivo 01 se timbra la que la sustituye. */
  cancelar(folio: string, motivo: MotivoCancelacion): string | null {
    const f = this.facturas().find((x) => serieFolio(x) === folio);
    if (!f || f.estado !== 'timbrada') return null;
    const sustituta = motivo === '01' ? this.timbrar({ cliente: f.cliente, rfc: f.rfc, origen: f.origen, total: f.total, pidio: 'Admin', global: f.global, sustituye: folio }) : undefined;
    const por = this.auth.sesion()?.nombre ?? '';
    this.facturas.update((lista) =>
      lista.map((x) => (serieFolio(x) === folio ? { ...x, estado: 'cancelada', cancelacion: { motivo, fecha: new Date().toISOString(), por, sustituta } } : x)),
    );
    return sustituta ?? null;
  }

  /** La factura global vigente (no cancelada) de un mes. */
  globalDe(mes: string): Cfdi | undefined {
    return this.facturas().find((f) => f.global === mes && f.estado === 'timbrada');
  }
}
