import { Injectable, computed, inject, signal } from '@angular/core';
import { InventarioService } from '../../cajera/inventario/inventario.service';
import { OrdenesService } from '../../cajera/ordenes/ordenes.service';

export type Urgencia = 'normal' | 'hoy';
export type EstadoPieza = 'nueva' | 'abierta' | 'danada';

export const ESTADOS_PIEZA: Record<EstadoPieza, { texto: string; detalle: string; tono: string }> = {
  nueva: { texto: 'Nueva, sin abrir', detalle: 'Regresa al stock disponible', tono: 'info' },
  abierta: { texto: 'Abierta, funciona', detalle: 'Regresa como pieza abierta', tono: 'advertencia' },
  danada: { texto: 'Dañada', detalle: 'No regresa al stock · se reporta', tono: 'peligro' },
};

/** Pieza que un técnico pide para una orden (J5.1). */
export interface Solicitud {
  id: string;
  orden: string;
  tecnico: string;
  sku: string;
  nombre: string;
  cantidad: number;
  urgencia: Urgencia;
  fecha: string;
  /** Es para una re-cotización: se pide solo si el cliente aprueba. */
  siAprueba?: boolean;
  estado: 'pendiente' | 'entregada' | 'rechazada' | 'pedida';
  pedido?: string;
}

/** Pieza que regresa del taller sin usarse (J5.3). */
export interface Devolucion {
  id: string;
  orden: string;
  tecnico: string;
  sku: string;
  nombre: string;
  cantidad: number;
  /** Cómo dice el técnico que viene. */
  segunTecnico: EstadoPieza;
  motivo: string;
  fecha: string;
  recibida?: { estado: EstadoPieza; fecha: string; por: string };
}

export interface EventoRefaccion {
  fecha: string;
  folio: string;
  texto: string;
  por: string;
}

const haceMin = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString();

/**
 * J5 · Solicitudes de refacción de los técnicos, devoluciones e historial (datos de prueba hasta que exista la API).
 * Los pedidos a proveedor y el stock viven en `InventarioService` (los recibe caja en C7.5).
 */
@Injectable({ providedIn: 'root' })
export class RefaccionesService {
  private readonly inventario = inject(InventarioService);
  private readonly ordenes = inject(OrdenesService);

  readonly solicitudes = signal<Solicitud[]>([
    { id: 'R-214', orden: '#1029', tecnico: 'Carlos Ruiz', sku: 'CON-007', nombre: 'Adhesivo de tapa B-7000', cantidad: 1, urgencia: 'normal', fecha: haceMin(15), estado: 'pendiente' },
    { id: 'R-213', orden: '#1040', tecnico: 'Luis Ortega', sku: 'REF-G84-USB', nombre: 'Conector de carga Moto G84', cantidad: 1, urgencia: 'hoy', fecha: haceMin(40), estado: 'pendiente' },
    { id: 'R-215', orden: '#1024', tecnico: 'Luis Ortega', sku: 'REF-S22-FCAM', nombre: 'Flex de cámara frontal S22 Ultra', cantidad: 1, urgencia: 'normal', fecha: haceMin(55), siAprueba: true, estado: 'pendiente' },
  ]);

  readonly devoluciones = signal<Devolucion[]>([
    { id: 'R-205', orden: '#1037', tecnico: 'Luis Ortega', sku: 'REF-P30-BAT', nombre: 'Batería Huawei P30', cantidad: 1, segunTecnico: 'nueva', motivo: 'cliente rechazó', fecha: haceMin(180) },
  ]);

  readonly historial = signal<EventoRefaccion[]>([
    { fecha: haceMin(60 * 26), folio: 'R-211', texto: 'Kit de sellos iPhone 11 para #1028 · pedido en PED-0123', por: 'Jorge López' },
    { fecha: haceMin(60 * 30), folio: 'R-210', texto: 'Batería iPhone 14 para #1043 · entregada a Carlos Ruiz', por: 'Jorge López' },
    { fecha: haceMin(60 * 50), folio: 'R-209', texto: 'Pantalla OLED iPhone 12 para #1035 · apartada', por: 'Jorge López' },
  ]);

  /** Pedidos recibidos con faltantes que ya se reclamaron al proveedor. */
  readonly reclamados = signal<string[]>([]);

  readonly pendientes = computed(() => this.solicitudes().filter((s) => s.estado === 'pendiente'));
  readonly devolucionesPendientes = computed(() => this.devoluciones().filter((d) => !d.recibida));

  /** Piezas disponibles para esa orden (stock menos lo apartado para otras). */
  enStock(s: Pick<Solicitud, 'sku' | 'orden' | 'cantidad'>): number {
    return this.inventario.paraOrden(s.sku, s.orden);
  }

  private anotar(folio: string, texto: string, por: string): void {
    this.historial.update((lista) => [{ fecha: new Date().toISOString(), folio, texto, por }, ...lista]);
  }

  private cambiar(id: string, cambio: Partial<Solicitud>): Solicitud | undefined {
    this.solicitudes.update((lista) => lista.map((s) => (s.id === id ? { ...s, ...cambio } : s)));
    return this.solicitudes().find((s) => s.id === id);
  }

  /** La pieza sale del inventario y se carga a la orden; el técnico recibe el aviso en su banco. */
  entregar(id: string, por: string): Solicitud | undefined {
    const s = this.cambiar(id, { estado: 'entregada' });
    if (!s) return;
    this.inventario.surtir(s.sku, s.cantidad, s.orden);
    this.ordenes.anotar(s.orden, `${s.nombre} ×${s.cantidad} entregada a ${s.tecnico} (${s.id})`);
    this.anotar(s.id, `${s.nombre} para ${s.orden} · entregada a ${s.tecnico}`, por);
    return s;
  }

  rechazar(id: string, por: string): Solicitud | undefined {
    const s = this.cambiar(id, { estado: 'rechazada' });
    if (!s) return;
    this.ordenes.anotar(s.orden, `Solicitud ${s.id} (${s.nombre}) rechazada por ${por}`);
    this.anotar(s.id, `${s.nombre} para ${s.orden} · rechazada`, por);
    return s;
  }

  /** J5.2 · Queda pedida al proveedor; si la orden está en el taller, se pausa hasta que llegue. */
  pedida(id: string, pedido: string, llega: string, por: string): void {
    const s = this.cambiar(id, { estado: 'pedida', pedido });
    if (!s) return;
    this.ordenes.esperarRefaccion(s.orden, `Solicitud ${s.id}: ${s.nombre} · pedido ${pedido} (llega ${llega})`);
    this.ordenes.anotar(s.orden, `${s.nombre} pedida al proveedor en ${pedido} · llega ${llega}`);
    this.anotar(s.id, `${s.nombre} para ${s.orden} · pedido en ${pedido}`, por);
  }

  /** J5.3 · Nueva o abierta regresa al stock; dañada solo se reporta. */
  recibirDevolucion(id: string, estado: EstadoPieza, por: string): Devolucion | undefined {
    this.devoluciones.update((lista) => lista.map((d) => (d.id === id ? { ...d, recibida: { estado, fecha: new Date().toISOString(), por } } : d)));
    const d = this.devoluciones().find((x) => x.id === id);
    if (!d) return;
    if (estado !== 'danada') this.inventario.devolver(d.sku, d.cantidad);
    this.anotar(d.id, `${d.nombre} de ${d.orden} · devolución recibida ${ESTADOS_PIEZA[estado].texto.toLowerCase()}`, por);
    return d;
  }

  /** T3.3 · El técnico pide una pieza o consumible para su orden; el jefe la ve en J5.1. */
  solicitar(datos: Pick<Solicitud, 'orden' | 'tecnico' | 'sku' | 'nombre' | 'cantidad' | 'urgencia'>): Solicitud {
    const numero = Math.max(0, ...[...this.solicitudes(), ...this.devoluciones()].map((s) => Number(s.id.slice(2)))) + 1;
    const solicitud: Solicitud = { ...datos, id: `R-${numero}`, fecha: new Date().toISOString(), estado: 'pendiente' };
    this.solicitudes.update((lista) => [solicitud, ...lista]);
    return solicitud;
  }

  registrarPedido(folio: string, texto: string, por: string): void {
    this.anotar(folio, texto, por);
  }

  reclamar(pedido: string, por: string): void {
    this.reclamados.update((lista) => [...lista, pedido]);
    this.anotar(pedido, 'Faltante reclamado al proveedor', por);
  }
}
