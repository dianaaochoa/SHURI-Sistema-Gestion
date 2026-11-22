import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import { ClavePregunta, PREGUNTAS_SEGURIDAD, PreguntaSeguridad, enmascararCorreo, normalizarRespuesta, textoPregunta } from '../acceso/auth.service';
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
/** Respuestas mal a la pregunta de seguridad antes de anular la recuperación (como la API). */
const INTENTOS_PREGUNTA = 3;
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
  /**
   * Pregunta de seguridad de cada cliente (como `customers.security_question`); solo sirve para recuperar la
   * contraseña. De prueba: María, “¿Cómo se llamaba tu primera mascota?” → Firulais.
   */
  private readonly preguntas = signal<Record<string, PreguntaSeguridad>>({ 'c-001': { clave: 'first_pet', respuesta: 'firulais' } });
  /** Recuperación en curso (P1.3): de quién y cuántas respuestas mal lleva. */
  private readonly recuperando = signal<{ clienteId: string; intentos: number } | null>(null);
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

  /** Texto de la pregunta del cliente con sesión (nunca la respuesta). */
  readonly preguntaDelCliente = computed(() => {
    const s = this.sesion();
    const q = s ? this.preguntas()[s.clienteId] : undefined;
    return q ? textoPregunta(q.clave) : null;
  });

  /** Como `PUT /portal/security-question`: pide la contraseña actual y guarda la pregunta con su respuesta. */
  guardarPregunta(clave: ClavePregunta, respuesta: string, actual?: string): Observable<{ ok: boolean; mensaje?: string }> {
    const cliente = this.cliente();
    if (!cliente) return of({ ok: false, mensaje: 'Vuelve a iniciar sesión.' });
    const propia = this.propias.get(cliente.id) ?? (cliente.portal?.tipo === 'personalizada' ? CONTRASENA_DEMO : undefined);
    if (!actual || actual !== propia) return of({ ok: false, mensaje: 'La contraseña actual no es correcta.' }).pipe(delay(400));
    if (!PREGUNTAS_SEGURIDAD.some((p) => p.clave === clave) || normalizarRespuesta(respuesta).length < 2)
      return of({ ok: false, mensaje: 'Elige una pregunta y escribe al menos 2 letras.' });
    this.preguntas.update((m) => ({ ...m, [cliente.id]: { clave, respuesta: normalizarRespuesta(respuesta) } }));
    return of({ ok: true }).pipe(delay(400));
  }

  /**
   * P1.3 paso 1, como `POST /portal/password/forgot`: con el correo devuelve su pregunta de seguridad. Si no es
   * cliente o no tiene pregunta, el mismo aviso para todos (así nadie averigua quién es cliente).
   */
  iniciarRecuperacion(correo: string): Observable<{ pregunta: string } | { mensaje: string }> {
    const cliente = this.porCorreo(correo);
    const q = cliente ? this.preguntas()[cliente.id] : undefined;
    if (!cliente || !q) {
      this.recuperando.set(null);
      return of({ mensaje: 'No podemos recuperar esta cuenta en línea. Pide una contraseña temporal en la sucursal.' }).pipe(delay(500));
    }
    this.recuperando.set({ clienteId: cliente.id, intentos: 0 });
    return of({ pregunta: textoPregunta(q.clave) }).pipe(delay(500));
  }

  /**
   * P1.3 paso 2, como `POST /portal/password/answer`: respuesta correcta → temporal nueva al correo (como C8.4)
   * y se quita el bloqueo del acceso. A la 3.ª respuesta mal se anula.
   */
  responderRecuperacion(respuesta: string): Observable<{ ok: true; correo: string } | { ok: false; mensaje: string; anulada: boolean }> {
    const p = this.recuperando();
    const cliente = p ? this.clientes.buscar(p.clienteId) : undefined;
    const q = cliente ? this.preguntas()[cliente.id] : undefined;
    if (!p || !cliente?.correo || !q) return of({ ok: false as const, mensaje: 'Vuelve a escribir tu correo.', anulada: true });
    if (q.respuesta !== normalizarRespuesta(respuesta)) {
      const intentos = p.intentos + 1;
      if (intentos >= INTENTOS_PREGUNTA) {
        this.recuperando.set(null);
        return of({ ok: false as const, mensaje: 'Demasiadas respuestas incorrectas. Pide una contraseña temporal en la sucursal.', anulada: true }).pipe(delay(400));
      }
      this.recuperando.set({ ...p, intentos });
      const quedan = INTENTOS_PREGUNTA - intentos;
      return of({ ok: false as const, mensaje: `La respuesta no es correcta. Te ${quedan === 1 ? 'queda 1 intento' : `quedan ${quedan} intentos`}.`, anulada: false }).pipe(delay(400));
    }
    this.recuperando.set(null);
    const temporal = this.clientes.generarTemporal(cliente);
    this.propias.delete(cliente.id);
    this.fallos.delete(cliente.correo.toLowerCase());
    // Sin backend no sale el correo: la temporal se muestra en la consola para poder probar.
    console.info(`[demo] Contraseña temporal de ${cliente.correo}: ${temporal}`);
    return of({ ok: true as const, correo: enmascararCorreo(cliente.correo) }).pipe(delay(500));
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

  /** P3.1 · Solo si la orden ya se entregó, sigue en garantía y no se ha usado. */
  solicitarGarantia(folio: string, falla: string, desde: string, fotos: number): boolean {
    const o = this.ordenDe(folio);
    if (!o || o.estado !== 'terminada' || o.garantia || !o.entrega || !falla.trim()) return false;
    this.ordenes.solicitarGarantiaPortal(o.folio, falla.trim().slice(0, 300), desde, fotos);
    return true;
  }

  /** P3.2 · Acepta o rechaza el costo extra del dictamen de garantía. */
  responderGarantia(folio: string, acepta: boolean): boolean {
    const o = this.ordenDe(folio);
    const d = o?.garantia?.decision;
    if (!o || !d || d.tipo !== 'con-costo' || d.respuesta) return false;
    this.ordenes.responderGarantia(o.folio, acepta);
    return true;
  }

  /** P2.11 · Calificación del servicio (una por folio). */
  readonly calificaciones = signal<Record<string, { estrellas: number; gusto: string[]; comentario: string; fecha: string }>>({
    '#1002': { estrellas: 5, gusto: ['Rapidez', 'Trato', 'Avisos en el portal'], comentario: 'Quedó como nuevo y me avisaron por el portal.', fecha: new Date(Date.now() - 12 * 86_400_000).toISOString() },
    '#1006': { estrellas: 4, gusto: ['Precio'], comentario: '', fecha: new Date(Date.now() - 15 * 86_400_000).toISOString() },
  });

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
      const d = o.garantia?.decision;
      // Figma P1.2: dictamen con costo extra que espera la respuesta del cliente.
      const esperaGarantia = d?.tipo === 'con-costo' && !d.respuesta && o.estado === 'en-garantia';
      const e = esperaGarantia ? { texto: 'Garantía · requiere tu respuesta', tono: 'advertencia', pasos: 5, responder: true } : ESTADO_PORTAL[o.estado];
      const entregado = o.entrega?.fecha ? `Entregado ${diaMes(o.entrega.fecha)}` : '';
      const detalle = d && o.estado === 'en-garantia' ? 'Dictamen de garantía listo' : entregado || o.trabajo || `Recibido ${diaMes(o.recibido)}`;
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
