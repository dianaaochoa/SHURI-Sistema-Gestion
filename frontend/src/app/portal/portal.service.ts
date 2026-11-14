import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import { ClientesService } from '../cajera/clientes/clientes.service';
import { Orden, OrdenesService, EstadoOrden } from '../cajera/ordenes/ordenes.service';
import { Cliente } from '../cajera/punto-de-venta/clientes.datos';
import { PortalSesion, SesionPortal } from './portal-sesion';

export type { SesionPortal } from './portal-sesion';

export type ResultadoPortal = { ok: true; sesion: SesionPortal } | { ok: false; mensaje: string };

/** Cómo ve el cliente cada estado (Figma P1.2): texto, color, avance de 6 pasos y si espera su respuesta. */
export const ESTADO_PORTAL: Record<EstadoOrden, { texto: string; tono: string; pasos: number; responder?: boolean }> = {
  'por-cotizar': { texto: 'En revisión', tono: 'info', pasos: 1 },
  'por-aprobar': { texto: 'Presupuesto · requiere tu respuesta', tono: 'advertencia', pasos: 2, responder: true },
  adicional: { texto: 'Cargo adicional · requiere tu respuesta', tono: 'advertencia', pasos: 3, responder: true },
  'en-taller': { texto: 'En reparación', tono: 'info', pasos: 4 },
  'esperando-refaccion': { texto: 'Esperando refacción', tono: 'info', pasos: 4 },
  'en-garantia': { texto: 'Garantía en revisión', tono: 'info', pasos: 4 },
  lista: { texto: 'Listo para recoger', tono: 'exito', pasos: 5 },
  'garantia-lista': { texto: 'Garantía lista para recoger', tono: 'exito', pasos: 5 },
  'sin-reparacion': { texto: 'Sin reparación · pasa por tu equipo', tono: 'peligro', pasos: 5 },
  vencida: { texto: 'Pasa por tu equipo', tono: 'peligro', pasos: 5 },
  bodega: { texto: 'En bodega · pasa por tu equipo', tono: 'peligro', pasos: 5 },
  terminada: { texto: 'Terminado', tono: 'exito', pasos: 6 },
  'sin-reparar-entregada': { texto: 'Entregado sin reparar', tono: 'neutro', pasos: 6 },
};

export interface EquipoPortal {
  folio: string;
  equipo: string;
  detalle: string;
  estado: { texto: string; tono: string };
  pasos: number;
  responder: boolean;
  /** Orden activa que se puede abrir (P2). */
  orden?: Orden;
}

const INTENTOS = 5;
const BLOQUEO_MIN = 15;
/** Contraseña de prueba de los clientes que ya crearon la suya (mientras no exista la API). */
const CONTRASENA_DEMO = 'Shuri2026!';

const diaMes = (iso: string) => {
  const f = new Date(iso);
  return `${f.getDate()} ${f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;
};

/**
 * Portal del cliente (P1–P6). Sesión aparte de la del personal: entra con su correo y la contraseña que creó
 * (o la temporal que le dio caja en C8.4). Simulado en memoria hasta conectar la API.
 */
@Injectable({ providedIn: 'root' })
export class PortalService {
  private readonly clientes = inject(ClientesService);
  private readonly ordenes = inject(OrdenesService);

  /** Contraseñas que el cliente creó en P1.4 (la API las guardará con hash). */
  private readonly propias = new Map<string, string>();
  private readonly fallos = new Map<string, { n: number; hasta?: number }>();
  private readonly sesiones = inject(PortalSesion);
  readonly sesion = this.sesiones.sesion;
  readonly cliente = computed(() => {
    const s = this.sesion();
    return s ? (this.clientes.buscar(s.clienteId) ?? null) : null;
  });

  private porCorreo(correo: string): Cliente | undefined {
    const c = correo.trim().toLowerCase();
    return c ? this.clientes.clientes().find((x) => x.correo?.toLowerCase() === c) : undefined;
  }

  iniciarSesion(correo: string, contrasena: string): Observable<ResultadoPortal> {
    const clave = correo.trim().toLowerCase();
    const cliente = this.porCorreo(clave);
    const f = this.fallos.get(clave) ?? { n: 0 };
    let r: ResultadoPortal;
    if (f.hasta && f.hasta > Date.now()) {
      r = { ok: false, mensaje: `Por seguridad bloqueamos el acceso unos minutos. Intenta después de las ${new Date(f.hasta).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} o pide ayuda al taller.` };
    } else {
      const temporal = cliente?.portal?.tipo === 'temporal' ? cliente.portal.temporal : undefined;
      const propia = cliente ? (this.propias.get(cliente.id) ?? (cliente.portal?.tipo === 'personalizada' ? CONTRASENA_DEMO : undefined)) : undefined;
      const esTemporal = !!temporal && contrasena.trim().toUpperCase() === temporal;
      if (cliente && (esTemporal || (propia && contrasena === propia))) {
        this.fallos.delete(clave);
        const sesion: SesionPortal = { clienteId: cliente.id, nombre: cliente.nombre, temporal: esTemporal };
        this.sesiones.guardar(sesion);
        r = { ok: true, sesion };
      } else {
        const n = f.hasta ? 1 : f.n + 1;
        const bloquear = n >= INTENTOS;
        this.fallos.set(clave, { n: bloquear ? 0 : n, hasta: bloquear ? Date.now() + BLOQUEO_MIN * 60_000 : undefined });
        const quedan = INTENTOS - n;
        r = {
          ok: false,
          mensaje: bloquear
            ? `Correo o contraseña incorrectos. Por seguridad bloqueamos el acceso ${BLOQUEO_MIN} minutos.`
            : `Correo o contraseña incorrectos. Te ${quedan === 1 ? 'queda 1 intento' : `quedan ${quedan} intentos`}.`,
        };
      }
    }
    return of(r).pipe(delay(400));
  }

  /**
   * P1.3 · Genera una temporal (como C8.4) y la "envía" al correo registrado. Siempre responde igual, exista o no
   * el correo, para no revelar quién es cliente.
   */
  solicitarTemporal(correo: string): Observable<void> {
    const cliente = this.porCorreo(correo);
    if (cliente) {
      this.clientes.generarTemporal(cliente);
      this.propias.delete(cliente.id);
    }
    return of(undefined).pipe(delay(500));
  }

  /** P1.4 · La temporal deja de funcionar. */
  crearContrasena(nueva: string): Observable<void> {
    const s = this.sesion();
    const cliente = this.cliente();
    if (s && cliente) {
      this.propias.set(cliente.id, nueva);
      this.clientes.guardar({ ...cliente, portal: { tipo: 'personalizada', fecha: new Date().toISOString() } });
      this.sesiones.guardar({ ...s, temporal: false });
    }
    return of(undefined).pipe(delay(400));
  }

  /** Orden activa del cliente con sesión (nunca la de otro cliente). */
  ordenDe(folio: string): Orden | undefined {
    return this.equipos().find((e) => e.folio.replace('#', '') === folio.replace('#', ''))?.orden;
  }

  /** P2.4 / P2.8 · El cliente aprueba o rechaza el presupuesto o el cargo adicional desde el portal. */
  responder(folio: string, aprobo: boolean, nota = ''): boolean {
    const o = this.ordenDe(folio);
    const cliente = this.cliente();
    if (!o || !cliente || (o.estado !== 'por-aprobar' && o.estado !== 'adicional')) return false;
    this.ordenes.registrarRespuesta(o.folio, aprobo, nota, cliente.nombre, true);
    return true;
  }

  /** P2.11 · Calificación del servicio (una por folio). */
  readonly calificaciones = signal<Record<string, { estrellas: number; gusto: string[]; comentario: string; fecha: string }>>({});

  calificar(folio: string, estrellas: number, gusto: string[], comentario: string): void {
    if (!this.ordenDe(folio)) return;
    this.calificaciones.update((c) => ({ ...c, [folio]: { estrellas, gusto, comentario: comentario.trim().slice(0, 300), fecha: new Date().toISOString() } }));
  }

  cerrarSesion(): void {
    this.sesiones.cerrar();
  }

  /** P1.2 · Equipos del cliente: los que están en el taller y los que ya se entregaron. */
  readonly equipos = computed<EquipoPortal[]>(() => {
    const c = this.cliente();
    if (!c) return [];
    this.ordenes.ordenes();
    const activos = this.clientes.ordenesDe(c).map((o) => {
      const e = ESTADO_PORTAL[o.estado];
      const entregado = o.entrega?.fecha ? `Entregado ${diaMes(o.entrega.fecha)}` : '';
      const detalle = o.garantia?.decision && o.estado === 'en-garantia' ? 'Dictamen de garantía listo' : entregado || o.trabajo || `Recibido ${diaMes(o.recibido)}`;
      return { folio: o.folio, equipo: o.equipo, detalle: `Folio ${o.folio} · ${detalle}`, estado: { texto: e.texto, tono: e.tono }, pasos: e.pasos, responder: !!e.responder, orden: o };
    });
    const folios = new Set(activos.map((a) => a.folio));
    const archivo = this.clientes
      .historial(c)
      .filter((h) => h.tipo === 'Equipo' && !folios.has(h.folio))
      .map((h) => {
        const sinReparar = h.estado.tono === 'peligro';
        return {
          folio: h.folio,
          equipo: h.descripcion.split(' · ')[0],
          detalle: `Folio ${h.folio} · Entregado ${diaMes(h.fecha)}`,
          estado: sinReparar ? { texto: 'Entregado sin reparar', tono: 'neutro' } : { texto: 'Terminado', tono: 'exito' },
          pasos: 6,
          responder: false,
        };
      });
    return [...activos, ...archivo];
  });
}
