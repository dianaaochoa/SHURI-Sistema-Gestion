import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, switchMap, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { mensajeDeError } from '../api/errores-api';
import { borrarToken, guardarToken } from '../api/token-api';
import { OrdenApi, ordenDeApi, telefonoLegible } from '../cajera/ordenes/ordenes.api';
import { EstadoOrden, Orden } from '../cajera/ordenes/ordenes.service';
import { Cliente } from '../cajera/punto-de-venta/clientes.datos';
import { PortalSesion, SesionPortal } from './portal-sesion';

export type { SesionPortal } from './portal-sesion';

export type ResultadoPortal = { ok: true; sesion: SesionPortal } | { ok: false; mensaje: string };
export type ResultadoAccion = { ok: true; mensaje: string } | { ok: false; mensaje: string };

/** P1.3 paso 1: la pregunta secreta del cliente (o un aviso si no tiene). */
export type InicioRecuperacionPortal = { ok: true; recuperacionId: string; pregunta: string } | { ok: false; mensaje: string };

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
  /** Orden que se puede abrir (P2). */
  orden?: Orden;
}

/** Cliente como lo responde GET /portal/me (CustomerResource). */
interface ClienteApi {
  id: number;
  name: string;
  last_name: string | null;
  email: string | null;
  phone: string;
  must_change_password: boolean;
  has_security_question: boolean;
}

type OrdenPortalApi = OrdenApi & { rating?: { stars: number; tags: string[]; comment: string | null; rated_at: string } | null };

const diaMes = (iso: string) => {
  const f = new Date(iso);
  return `${f.getDate()} ${f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;
};

/**
 * Portal del cliente (P1–P6) conectado a la API con su propio token (Sanctum, ability "customer"):
 * acceso, crear contraseña y pregunta secreta, recuperar la contraseña, sus equipos con el
 * seguimiento completo, aprobar o rechazar el presupuesto, garantía y calificación.
 */
@Injectable({ providedIn: 'root' })
export class PortalService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/portal`;
  private readonly sesiones = inject(PortalSesion);
  readonly sesion = this.sesiones.sesion;

  private readonly datosCliente = signal<ClienteApi | null>(null);
  private readonly ordenesApi = signal<OrdenPortalApi[]>([]);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  /** La contraseña con la que entró: la API la pide para guardar la pregunta y la nueva contraseña (P1.4). */
  private contrasenaTemporal: string | null = null;

  constructor() {
    // Con sesión del portal (y ya con su contraseña propia) se cargan sus datos
    effect(() => {
      const s = this.sesion();
      untracked(() => {
        if (s && !s.temporal) this.cargar();
        if (!s) {
          this.datosCliente.set(null);
          this.ordenesApi.set([]);
        }
      });
    });
  }

  /** Datos del cliente con sesión (lo que muestran Mis equipos y Facturación). */
  readonly cliente = computed<Cliente | null>(() => {
    const c = this.datosCliente();
    const s = this.sesion();
    if (!c) return s ? { id: s.clienteId, nombre: s.nombre } : null;
    return { id: String(c.id), nombre: [c.name, c.last_name].filter(Boolean).join(' '), telefono: telefonoLegible(c.phone), correo: c.email ?? undefined };
  });

  /** Sus órdenes en el modelo que usan las pantallas (mismo mapeo que el personal). */
  private readonly ordenes = computed<Orden[]>(() => this.ordenesApi().map((o) => ordenDeApi(o)));

  /** P2.11 · Calificaciones que ya dio, por folio. */
  readonly calificaciones = computed<Record<string, { estrellas: number; gusto: string[]; comentario: string; fecha: string }>>(() =>
    Object.fromEntries(
      this.ordenesApi()
        .filter((o) => o.rating)
        .map((o) => [`#${o.folio}`, { estrellas: o.rating!.stars, gusto: o.rating!.tags, comentario: o.rating!.comment ?? '', fecha: o.rating!.rated_at }]),
    ),
  );

  /** GET /portal/me y GET /portal/orders?include=detail */
  cargar(): void {
    this.cargando.set(true);
    this.http.get<{ data: ClienteApi }>(`${this.api}/me`).subscribe({ next: (r) => this.datosCliente.set(r.data), error: () => undefined });
    this.http.get<{ data: OrdenPortalApi[] }>(`${this.api}/orders`, { params: { include: 'detail' } }).subscribe({
      next: (r) => {
        this.ordenesApi.set(r.data);
        this.error.set(null);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  /** P1.1 · POST /portal/login. Con la contraseña temporal, el cliente pasa a crear la suya. */
  iniciarSesion(correo: string, contrasena: string): Observable<ResultadoPortal> {
    type Respuesta = { token: string; customer: ClienteApi };
    return this.http.post<Respuesta>(`${environment.apiUrl}/portal/login`, { email: correo.trim().toLowerCase(), password: contrasena, device_name: 'Portal web' }).pipe(
      map((r): ResultadoPortal => {
        guardarToken('portal', r.token);
        this.datosCliente.set(r.customer);
        const temporal = r.customer.must_change_password;
        this.contrasenaTemporal = temporal ? contrasena : null;
        const sesion: SesionPortal = { clienteId: String(r.customer.id), nombre: [r.customer.name, r.customer.last_name].filter(Boolean).join(' '), temporal };
        this.sesiones.guardar(sesion);
        return { ok: true, sesion };
      }),
      catchError((e) => of<ResultadoPortal>({ ok: false, mensaje: mensajeDeError(e) })),
    );
  }

  /** Preguntas secretas para elegir (P1.4). */
  preguntasSecretas(): Observable<{ clave: string; texto: string }[]> {
    return this.http.get<{ data: { key: string; text: string }[] }>(`${environment.apiUrl}/security-questions`).pipe(
      map((r) => r.data.map((p) => ({ clave: p.key, texto: p.text }))),
      catchError(() => of([])),
    );
  }

  /**
   * Si el cliente ya tiene pregunta de seguridad. La API no devuelve cuál es (solo `has_security_question`),
   * así que se muestra un texto genérico; null si todavía no tiene.
   */
  readonly preguntaDelCliente = computed(() => (this.datosCliente()?.has_security_question ? 'Ya tienes una pregunta configurada.' : null));

  /** PUT /portal/security-question: pide la contraseña actual y guarda la pregunta con su respuesta. */
  guardarPregunta(clave: string, respuesta: string, actual?: string): Observable<{ ok: boolean; mensaje?: string }> {
    if (!actual) return of({ ok: false, mensaje: 'Escribe tu contraseña actual.' });
    return this.http.put<{ message: string }>(`${this.api}/security-question`, { current_password: actual, question: clave, answer: respuesta.trim() }).pipe(
      map((r) => {
        const c = this.datosCliente();
        if (c) this.datosCliente.set({ ...c, has_security_question: true });
        return { ok: true, mensaje: r.message };
      }),
      catchError((e) => of({ ok: false, mensaje: mensajeDeError(e) })),
    );
  }

  /**
   * P1.4 · Elige su pregunta secreta y crea su contraseña. Primero la pregunta (la API pide la
   * temporal) y después la contraseña: si algo falla, puede reintentar con la misma temporal.
   */
  crearContrasena(nueva: string, secreta: { pregunta: string; respuesta: string }): Observable<ResultadoAccion> {
    const temporal = this.contrasenaTemporal;
    if (!temporal) return of({ ok: false, mensaje: 'Por seguridad, vuelve a iniciar sesión con tu contraseña temporal.' });

    return this.http.put(`${this.api}/security-question`, { current_password: temporal, question: secreta.pregunta, answer: secreta.respuesta.trim() }).pipe(
      switchMap(() => this.http.put<{ message: string }>(`${this.api}/password`, { current_password: temporal, password: nueva, password_confirmation: nueva })),
      map((r): ResultadoAccion => {
        this.contrasenaTemporal = null;
        const s = this.sesion();
        if (s) this.sesiones.guardar({ ...s, temporal: false });
        return { ok: true, mensaje: r.message };
      }),
      catchError((e) => of<ResultadoAccion>({ ok: false, mensaje: mensajeDeError(e) })),
    );
  }

  /** P1.3 paso 1 · POST /portal/password/forgot: devuelve su pregunta secreta. */
  iniciarRecuperacion(correo: string): Observable<InicioRecuperacionPortal> {
    type Respuesta = { requires_answer: true; recovery_id: string; security_question: string } | { requires_answer: false; message: string };
    return this.http.post<Respuesta>(`${environment.apiUrl}/portal/password/forgot`, { login: correo.trim().toLowerCase() }).pipe(
      map((r): InicioRecuperacionPortal => (r.requires_answer ? { ok: true, recuperacionId: r.recovery_id, pregunta: r.security_question } : { ok: false, mensaje: r.message })),
      catchError((e) => of<InicioRecuperacionPortal>({ ok: false, mensaje: mensajeDeError(e) })),
    );
  }

  /** P1.3 paso 2 · Respuesta correcta → contraseña temporal a su correo. */
  responderPregunta(recuperacionId: string, respuesta: string): Observable<{ ok: true; correo: string } | { ok: false; mensaje: string }> {
    return this.http.post<{ email_hint: string }>(`${environment.apiUrl}/portal/password/answer`, { recovery_id: recuperacionId, answer: respuesta }).pipe(
      map((r) => ({ ok: true as const, correo: r.email_hint })),
      catchError((e) => of({ ok: false as const, mensaje: mensajeDeError(e) })),
    );
  }

  /** Orden del cliente con sesión (nunca la de otro cliente: la API solo devuelve las suyas). */
  ordenDe(folio: string): Orden | undefined {
    const limpio = folio.replace('#', '');
    return this.ordenes().find((o) => o.folio.replace('#', '') === limpio);
  }

  /** Reemplaza la orden con la que devolvió la API. */
  private recargar(): Observable<void> {
    return this.http.get<{ data: OrdenPortalApi[] }>(`${this.api}/orders`, { params: { include: 'detail' } }).pipe(
      tap((r) => this.ordenesApi.set(r.data)),
      map(() => undefined),
      catchError(() => of(undefined)),
    );
  }

  /** Dispara la petición aunque nadie se suscriba, recarga sus órdenes y comparte el resultado. */
  private accion(peticion: Observable<{ message: string }>): Observable<ResultadoAccion> {
    const r = peticion.pipe(
      switchMap((res) => this.recargar().pipe(map((): ResultadoAccion => ({ ok: true, mensaje: res.message })))),
      catchError((e) => of<ResultadoAccion>({ ok: false, mensaje: mensajeDeError(e) })),
      shareReplay(1),
    );
    r.subscribe();
    return r;
  }

  /** P2.4 / P2.8 · Aprueba o rechaza el presupuesto o el cargo adicional (POST /portal/quotes/{folio}/approve|reject). */
  responder(folio: string, aprobo: boolean, nota = ''): Observable<ResultadoAccion> {
    const o = this.ordenDe(folio);
    if (!o?.presupuestoFolio || (o.estado !== 'por-aprobar' && o.estado !== 'adicional')) return of({ ok: false, mensaje: 'Este equipo no tiene un presupuesto por responder.' });
    return this.accion(this.http.post<{ message: string }>(`${this.api}/quotes/${o.presupuestoFolio}/${aprobo ? 'approve' : 'reject'}`, { comment: nota.trim() || null }));
  }

  /** P3.1 · Solicita la garantía (POST /portal/orders/{folio}/warranty). */
  solicitarGarantia(folio: string, falla: string, desde: string, fotos: number): Observable<ResultadoAccion> {
    const o = this.ordenDe(folio);
    if (!o || !falla.trim()) return of({ ok: false, mensaje: 'Describe la falla de tu equipo.' });
    const detalle = [falla.trim(), desde ? `Desde el ${desde}` : '', fotos ? `${fotos} ${fotos === 1 ? 'foto' : 'fotos'} (las mostrará en sucursal)` : ''].filter(Boolean).join(' · ');
    return this.accion(this.http.post<{ message: string }>(`${this.api}/orders/${folio.replace('#', '')}/warranty`, { reason: detalle.slice(0, 2000) }));
  }

  /** P3.2 · Acepta o rechaza el costo extra del dictamen (POST /portal/warranties/{folio}/answer). */
  responderGarantia(folio: string, acepta: boolean): Observable<ResultadoAccion> {
    const w = this.ordenesApi().find((x) => x.folio === folio.replace('#', ''))?.warranty;
    if (!w) return of({ ok: false, mensaje: 'Este equipo no tiene una garantía por responder.' });
    return this.accion(this.http.post<{ message: string }>(`${this.api}/warranties/${w.folio}/answer`, { accept: acepta }));
  }

  /** P2.11 · Calificación del servicio (una por folio, con el equipo ya entregado). */
  calificar(folio: string, estrellas: number, gusto: string[], comentario: string): Observable<ResultadoAccion> {
    return this.accion(
      this.http.post<{ message: string }>(`${this.api}/orders/${folio.replace('#', '')}/rating`, { stars: estrellas, tags: gusto, comment: comentario.trim().slice(0, 300) || null }),
    );
  }

  /** POST /portal/logout y limpia la sesión local. */
  cerrarSesion(): void {
    this.http.post(`${this.api}/logout`, {}).subscribe({ error: () => undefined });
    borrarToken('portal');
    this.contrasenaTemporal = null;
    this.sesiones.cerrar();
  }

  /** P1.2 · Equipos del cliente: los que están en el taller y los que ya se entregaron. */
  readonly equipos = computed<EquipoPortal[]>(() =>
    this.ordenes().map((o) => {
      const d = o.garantia?.decision;
      // Figma P1.2: dictamen con costo extra que espera la respuesta del cliente.
      const esperaGarantia = d?.tipo === 'con-costo' && !d.respuesta && o.estado === 'en-garantia';
      const e = esperaGarantia ? { texto: 'Garantía · requiere tu respuesta', tono: 'advertencia', pasos: 5, responder: true } : ESTADO_PORTAL[o.estado];
      const entregado = o.entrega?.fecha ? `Entregado ${diaMes(o.entrega.fecha)}` : '';
      const detalle = d && o.estado === 'en-garantia' ? 'Dictamen de garantía listo' : entregado || o.trabajo || `Recibido ${diaMes(o.recibido)}`;
      return { folio: o.folio, equipo: o.equipo, detalle: `Folio ${o.folio} · ${detalle}`, estado: { texto: e.texto, tono: e.tono }, pasos: e.pasos, responder: !!e.responder, orden: o };
    }),
  );
}
