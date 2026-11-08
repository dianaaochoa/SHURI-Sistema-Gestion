import { Injectable, computed, inject, signal } from '@angular/core';
import { ESTADOS_ORDEN, EstadoOrden, Orden, OrdenesService, etiquetaEstado } from '../ordenes/ordenes.service';
import { CLIENTES, Cliente, PUBLICO_GENERAL } from '../punto-de-venta/clientes.datos';
import { ESTADOS as ESTADOS_VENTA, HistorialVentasService, VentaRegistrada, reembolsado } from '../ventas/historial-ventas.service';

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

/** Equipos que ya no están en el taller (C8 "Terminado") y compras viejas: antes de los datos de prueba de Órdenes y Ventas. */
const ARCHIVO: Record<string, MovimientoCliente[]> = {
  'c-001': [
    { fecha: '2026-09-20T12:10:00', tipo: 'Compra', folio: 'V-00815', descripcion: 'Mica + funda', monto: 320, pagado: 320, estado: ESTADOS_VENTA.pagada },
    { fecha: '2026-08-02T17:30:00', tipo: 'Compra', folio: 'V-00702', descripcion: 'Cargador USB-C 20W', monto: 250, pagado: 250, estado: ESTADOS_VENTA.pagada },
    { fecha: '2026-07-24T11:00:00', tipo: 'Garantía', folio: '#0912-G', descripcion: 'iPhone 11 · Revisión de garantía', monto: null, pagado: 0, estado: { texto: 'Terminada', tono: 'neutro' } },
    { fecha: '2026-07-03T13:20:00', tipo: 'Equipo', folio: '#0912', descripcion: 'iPhone 11 · Cambio de batería', monto: 480, pagado: 480, estado: { texto: 'Terminado', tono: 'neutro' } },
    { fecha: '2026-04-18T16:45:00', tipo: 'Compra', folio: 'V-00411', descripcion: 'Funda uso rudo', monto: 189, pagado: 189, estado: ESTADOS_VENTA.pagada },
    { fecha: '2026-03-05T10:15:00', tipo: 'Equipo', folio: '#0655', descripcion: 'Moto G9 · Presupuesto rechazado', monto: 300, pagado: 300, estado: { texto: 'Sin reparar', tono: 'peligro' } },
  ],
};

/** Cómo se resume un equipo activo en la lista (Figma C8: "1 en taller", "1 listo", "1 por devolver"). */
const CATEGORIAS: Partial<Record<EstadoOrden, { texto: string; tono: string; prioridad: number }>> = {
  lista: { texto: 'listo', tono: 'exito', prioridad: 1 },
  'garantia-lista': { texto: 'listo', tono: 'exito', prioridad: 1 },
  'por-aprobar': { texto: 'por aprobar', tono: 'advertencia', prioridad: 2 },
  adicional: { texto: 'por aprobar', tono: 'advertencia', prioridad: 2 },
  'sin-reparacion': { texto: 'por devolver', tono: 'peligro', prioridad: 3 },
  vencida: { texto: 'por recoger', tono: 'peligro', prioridad: 3 },
  bodega: { texto: 'en bodega', tono: 'peligro', prioridad: 3 },
  'por-cotizar': { texto: 'en taller', tono: 'info', prioridad: 4 },
  'en-taller': { texto: 'en taller', tono: 'info', prioridad: 4 },
  'esperando-refaccion': { texto: 'en taller', tono: 'info', prioridad: 4 },
  'en-garantia': { texto: 'en taller', tono: 'info', prioridad: 4 },
};

export interface ResumenCliente {
  cliente: Cliente;
  equipos: { texto: string; tono: string; categoria: string } | null;
  ultimaVisita: string | null;
  total: number;
  visitas: number;
}

const digitos = (t?: string) => (t ?? '').replace(/\D/g, '');
const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

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
export function descripcionVenta(venta: VentaRegistrada): string {
  const palabras = [...new Set(venta.lineas.map((l) => l.nombre.split(' ')[0].toLowerCase()))];
  const texto = palabras.length > 1 ? `${palabras.slice(0, -1).join(', ')} y ${palabras.at(-1)}` : palabras[0] ?? '';
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Registro de clientes (C8). Une los clientes del punto de venta, de las órdenes y de las ventas. Simulado. */
@Injectable({ providedIn: 'root' })
export class ClientesService {
  private readonly ordenes = inject(OrdenesService);
  private readonly ventas = inject(HistorialVentasService);
  private readonly guardados = signal<Cliente[]>([...CLIENTES]);

  /** Todos los clientes: los registrados y los que solo aparecen en órdenes o ventas. */
  readonly clientes = computed<Cliente[]>(() => {
    const lista = [...this.guardados()];
    const agregar = (c: Cliente) => {
      if (!lista.some((x) => this.esMismo(x, c))) lista.push(c);
    };
    for (const o of [...this.ordenes.ordenes()].sort((a, b) => a.recibido.localeCompare(b.recibido))) {
      agregar({ id: `tel-${digitos(o.cliente.telefono)}`, nombre: o.cliente.nombre, telefono: o.cliente.telefono, correo: o.cliente.correo, desde: o.recibido });
    }
    for (const v of this.ventas.ventas()) {
      if (v.cliente.id !== PUBLICO_GENERAL.id) agregar({ ...v.cliente, desde: v.fecha });
    }
    return lista;
  });

  private esMismo(a: Pick<Cliente, 'id' | 'nombre' | 'telefono'>, b: Pick<Cliente, 'id' | 'nombre' | 'telefono'>): boolean {
    if (a.id === b.id) return true;
    const ta = digitos(a.telefono);
    if (ta && ta === digitos(b.telefono)) return true;
    return normal(a.nombre) === normal(b.nombre);
  }

  buscar(id: string): Cliente | undefined {
    return this.clientes().find((c) => c.id === id);
  }

  ordenesDe(c: Cliente): Orden[] {
    return this.ordenes
      .ordenes()
      .filter((o) => this.esMismo(c, { id: '', nombre: o.cliente.nombre, telefono: o.cliente.telefono }))
      .sort((a, b) => b.recibido.localeCompare(a.recibido));
  }

  ventasDe(c: Cliente): VentaRegistrada[] {
    return this.ventas
      .ventas()
      .filter((v) => v.cliente.id !== PUBLICO_GENERAL.id && this.esMismo(c, v.cliente))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  /** Todo lo que ha hecho el cliente, del más reciente al más antiguo. */
  historial(c: Cliente): MovimientoCliente[] {
    const equipos: MovimientoCliente[] = this.ordenesDe(c).flatMap((o) => {
      const fila: MovimientoCliente = {
        fecha: o.recibido,
        tipo: 'Equipo',
        folio: o.folio,
        descripcion: `${o.equipo} · ${o.trabajo}`,
        monto: o.presupuesto?.total ?? null,
        pagado: o.anticipo + (o.entrega?.pagado ?? 0),
        estado: { texto: etiquetaEstado(o), tono: ESTADOS_ORDEN[o.estado].tono },
        orden: o.folio,
      };
      if (!o.garantia) return [fila];
      return [fila, { fecha: o.garantia.recibida, tipo: 'Garantía', folio: `${o.folio}-G`, descripcion: `${o.equipo} · ${o.garantia.falla}`, monto: null, pagado: 0, estado: { texto: ESTADOS_ORDEN[o.estado].texto, tono: ESTADOS_ORDEN[o.estado].tono }, orden: o.folio }];
    });
    const compras: MovimientoCliente[] = this.ventasDe(c).map((v) => ({
      fecha: v.fecha,
      tipo: 'Compra',
      folio: v.folio,
      descripcion: descripcionVenta(v),
      monto: v.total,
      pagado: v.estado === 'cancelada' ? 0 : v.total - reembolsado(v),
      estado: ESTADOS_VENTA[v.estado],
    }));
    const archivo = (ARCHIVO[c.id] ?? []).filter((a) => !equipos.some((e) => e.folio === a.folio) && !compras.some((x) => x.folio === a.folio));
    return [...equipos, ...compras, ...archivo].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  /** Lo que muestra la lista: equipos activos, última visita y total gastado. */
  readonly resumenes = computed<ResumenCliente[]>(() =>
    this.clientes().map((cliente) => {
      const historial = this.historial(cliente);
      const activos = this.ordenesDe(cliente)
        .map((o) => CATEGORIAS[o.estado])
        .filter((x): x is NonNullable<typeof x> => !!x);
      let equipos: ResumenCliente['equipos'] = null;
      if (activos.length) {
        const principal = activos.reduce((a, b) => (b.prioridad < a.prioridad ? b : a));
        const mismos = activos.filter((a) => a.texto === principal.texto).length;
        const otros = activos.length - mismos;
        equipos = { texto: `${mismos} ${principal.texto}${otros ? ` +${otros}` : ''}`, tono: principal.tono, categoria: principal.texto };
      }
      const dias = new Set(historial.map((h) => new Date(h.fecha).toDateString()));
      return {
        cliente,
        equipos,
        ultimaVisita: historial[0]?.fecha ?? null,
        total: historial.reduce((s, h) => s + h.pagado, 0),
        visitas: dias.size,
      };
    }),
  );

  /** Alta o edición. También deja al cliente en la lista que usan Punto de venta y Nueva orden. */
  guardar(cliente: Cliente): void {
    const nuevo = { ...cliente, desde: cliente.desde ?? new Date().toISOString() };
    this.guardados.update((lista) => (lista.some((c) => c.id === nuevo.id) ? lista.map((c) => (c.id === nuevo.id ? nuevo : c)) : [...lista, nuevo]));
    const i = CLIENTES.findIndex((c) => c.id === nuevo.id);
    if (i >= 0) CLIENTES[i] = nuevo;
    else CLIENTES.push(nuevo);
  }

  /** C8.4: nueva contraseña temporal; la anterior deja de funcionar. */
  generarTemporal(cliente: Cliente): string {
    const letras = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const parte = () => Array.from({ length: 3 }, () => letras[Math.floor(Math.random() * letras.length)]).join('');
    const temporal = `${parte()}-${parte()}`;
    this.guardar({ ...cliente, portal: { tipo: 'temporal', fecha: new Date().toISOString(), temporal } });
    return temporal;
  }
}
