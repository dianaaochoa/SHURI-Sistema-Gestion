import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../acceso/auth.service';
import { PermisosService } from '../../administrador/permisos.service';
import { erroresDeCampos, mensajeDeError } from '../../api/errores-api';
import { InventarioService } from '../inventario/inventario.service';
import { CATALOGO, Producto } from './catalogo.datos';
import { CLIENTES, Cliente, DatosFiscales, PUBLICO_GENERAL } from './clientes.datos';

export const IVA = 0.16;
/** Descuento máximo por omisión; el de cada cajera lo define el administrador en AD7 (Figma C2.6). */
export const DESCUENTO_MAXIMO = 10;

export interface Linea {
  sku: string;
  nombre: string;
  /** Precio unitario antes de IVA. */
  precio: number;
  cantidad: number;
  /** Descuento de la línea en %. */
  descuento: number;
  /** null en productos temporales (no salen del inventario). */
  disponibles: number | null;
  nota?: string;
}

/** Descuento a toda la venta (C2.6): en % o en $ sobre el total con IVA. */
export interface DescuentoVenta {
  modo: '%' | '$';
  valor: number;
  motivo: string;
}

export interface VentaPausada {
  folio: string;
  cliente: Cliente;
  lineas: Linea[];
  descuento: DescuentoVenta | null;
  nota: string;
  /** ISO */
  pausadaEn: string;
}

export interface ProductoTemporal {
  nombre: string;
  cantidad: number;
  /** El modal C2.7 captura el precio con IVA incluido. */
  precioConIva: number;
  costo: number | null;
  categoria: string;
  nota: string;
  darDeAlta: boolean;
}

export type MetodoSimple = 'efectivo' | 'tarjeta' | 'transferencia';
export type MetodoPago = MetodoSimple | 'mixto';

/** Una parte de un cobro mixto (C2.13). */
export interface ParteMixta {
  metodo: MetodoSimple;
  monto: number | null;
  /** Autorización de la tarjeta o clave de rastreo de la transferencia. */
  referencia: string;
}

export interface Pago {
  metodo: MetodoPago;
  /** Lo que entregó el cliente (en mixto, la suma de las partes). */
  recibido: number;
  referencia?: string;
  partes?: ParteMixta[];
  imprimir: boolean;
  enviarCorreo: boolean;
  /** C2.18: datos para timbrar; null si no pidió factura. */
  factura: DatosFiscales | null;
}

export interface VentaCobrada {
  folio: string;
  total: number;
  metodo: MetodoPago;
  partes?: ParteMixta[];
  cambio: number;
  cliente: Cliente;
  imprimir: boolean;
  enviarCorreo: boolean;
  facturada: boolean;
  // Lo que necesita el historial (C3).
  lineas: Linea[];
  descuento: DescuentoVenta | null;
  subtotal: number;
  iva: number;
  recibido: number;
  referencia?: string;
}

export const redondear = (valor: number) => Math.round(valor * 100) / 100;

export function totalLinea(linea: Linea): number {
  return redondear(linea.precio * linea.cantidad * (1 - linea.descuento / 100));
}

/** Totales de un conjunto de líneas con un descuento a toda la venta. Precios antes de IVA. */
export function calcularTotales(lineas: Linea[], descuento: DescuentoVenta | null) {
  // Se suma sin redondear y se redondea al final: los precios de Inventario traen IVA incluido
  // (p. ej. $128.45 ÷ 1.16) y redondear a medio camino haría que el total no diera lo de la etiqueta.
  const bruto = lineas.reduce((suma, l) => suma + l.precio * l.cantidad, 0);
  const exactoLineas = lineas.reduce((suma, l) => suma + l.precio * l.cantidad * (1 - l.descuento / 100), 0);
  const exactoDescuentoVenta = !descuento
    ? 0
    : descuento.modo === '%'
      ? (exactoLineas * descuento.valor) / 100
      : descuento.valor / (1 + IVA);
  const exacto = exactoLineas - exactoDescuentoVenta;
  const subtotalLineas = redondear(exactoLineas);
  const subtotal = redondear(exacto);
  const total = redondear(exacto * (1 + IVA));
  return { subtotalLineas, subtotal, iva: redondear(total - subtotal), total, descuento: redondear(bruto - exacto) };
}

const folio = (numero: number) => `V-${String(numero).padStart(5, '0')}`;

const lineaDe = (sku: string, cantidad = 1): Linea => {
  const p = CATALOGO.find((producto) => producto.sku === sku)!;
  return { sku: p.sku, nombre: p.nombre, precio: p.precio, cantidad, descuento: 0, disponibles: p.disponibles };
};

/** Ventas pausadas de prueba (Figma C2.9). Sus totales salen de los productos, no de los importes fijos de Figma. */
function pausadasDemo(): VentaPausada[] {
  const haceMinutos = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString();
  return [
    {
      folio: folio(864),
      cliente: PUBLICO_GENERAL,
      lineas: [lineaDe('ACC-052'), lineaDe('ACC-001'), lineaDe('ACC-014')],
      descuento: null,
      nota: 'Fue por su cartera',
      pausadaEn: haceMinutos(4),
    },
    {
      folio: folio(863),
      cliente: CLIENTES.find((c) => c.nombre === 'Raúl Ortiz')!,
      lineas: [lineaDe('ACC-020'), lineaDe('ACC-014')],
      descuento: null,
      nota: 'Regresa por la tarde',
      pausadaEn: haceMinutos(25),
    },
  ];
}

/**
 * Venta en curso del punto de venta (C2) y ventas pausadas del turno.
 * Vive en memoria mientras la cajera navega por el sistema.
 * Simulada: al conectar la API, `cobrar` enviará la venta y el folio vendrá del servidor.
 */
@Injectable({ providedIn: 'root' })
export class VentaService {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly inventario = inject(InventarioService);
  /** Lo que la cajera con sesión puede descontar (AD7); el administrador no tiene límite. */
  private readonly permisos = inject(PermisosService);
  /** Sin el permiso “Aplicar descuentos” (AD7.3) el máximo es 0. */
  readonly descuentoMaximo = computed(() =>
    !this.permisos.puede('descuentos') ? 0 : (this.auth.perfil()?.descuentoMaximo ?? (this.auth.sesion()?.rol === 'administrador' ? 100 : DESCUENTO_MAXIMO)),
  );
  private readonly lineasActuales = signal<Linea[]>([]);
  private readonly numeroFolio = signal(865);
  private siguienteFolio = 866;
  private siguienteTemporal = 13;

  readonly lineas = this.lineasActuales.asReadonly();
  readonly folio = computed(() => folio(this.numeroFolio()));
  readonly cliente = signal<Cliente>(PUBLICO_GENERAL);
  readonly descuentoVenta = signal<DescuentoVenta | null>(null);
  readonly pausadas = signal<VentaPausada[]>(pausadasDemo());

  readonly vacia = computed(() => this.lineasActuales().length === 0);
  readonly articulos = computed(() => this.lineasActuales().reduce((suma, l) => suma + l.cantidad, 0));
  private readonly totales = computed(() => calcularTotales(this.lineasActuales(), this.descuentoVenta()));
  readonly subtotal = computed(() => this.totales().subtotal);
  readonly descuento = computed(() => this.totales().descuento);
  readonly iva = computed(() => this.totales().iva);
  readonly total = computed(() => this.totales().total);
  /** Total con IVA sin el descuento a toda la venta (C2.6 "Total actual"). */
  readonly totalSinDescuentoVenta = computed(() => calcularTotales(this.lineasActuales(), null).total);
  /** Nombre que muestra el botón de cliente (Figma: "Cliente general"). */
  readonly etiquetaCliente = computed(() => (this.cliente().id === PUBLICO_GENERAL.id ? 'Cliente general' : this.cliente().nombre));

  /** Agrega un producto o suma uno si ya está. Devuelve false si ya no hay disponibles. */
  agregar(producto: Producto): boolean {
    const existente = this.lineasActuales().find((l) => l.sku === producto.sku);
    if (existente) return this.cambiarCantidad(producto.sku, 1);
    if (producto.disponibles < 1) return false;
    const { sku, nombre, precio, disponibles } = producto;
    this.lineasActuales.update((lineas) => [...lineas, { sku, nombre, precio, cantidad: 1, descuento: 0, disponibles }]);
    return true;
  }

  agregarTemporal(temporal: ProductoTemporal): void {
    const sku = `TMP-${String(this.siguienteTemporal++).padStart(4, '0')}`;
    this.lineasActuales.update((lineas) => [
      ...lineas,
      {
        sku,
        nombre: temporal.nombre,
        precio: redondear(temporal.precioConIva / (1 + IVA)),
        cantidad: temporal.cantidad,
        descuento: 0,
        disponibles: null,
        nota: temporal.nota || undefined,
      },
    ]);
  }

  /** Código que tendrá el siguiente producto temporal (se muestra en C2.7). */
  codigoTemporal(): string {
    return `TMP-${String(this.siguienteTemporal).padStart(4, '0')}`;
  }

  cambiarCantidad(sku: string, cambio: number): boolean {
    let aplicado = false;
    this.lineasActuales.update((lineas) =>
      lineas.map((l) => {
        if (l.sku !== sku) return l;
        const cantidad = l.cantidad + cambio;
        if (cantidad < 1 || (l.disponibles !== null && cantidad > l.disponibles)) return l;
        aplicado = true;
        return { ...l, cantidad };
      }),
    );
    return aplicado;
  }

  /** Descuento de una línea en %, de 0 al máximo permitido. */
  fijarDescuento(sku: string, porcentaje: number): void {
    const descuento = Math.min(this.descuentoMaximo(), Math.max(0, Math.round(porcentaje * 100) / 100 || 0));
    this.lineasActuales.update((lineas) => lineas.map((l) => (l.sku === sku ? { ...l, descuento } : l)));
  }

  quitar(sku: string): void {
    this.lineasActuales.update((lineas) => lineas.filter((l) => l.sku !== sku));
  }

  cancelar(): void {
    this.lineasActuales.set([]);
    this.cliente.set(PUBLICO_GENERAL);
    this.descuentoVenta.set(null);
  }

  /** Lo que se pierde al hacer el corte: las ventas en espera (aviso de C2.9) y la venta sin cobrar. */
  readonly pendientesDelTurno = computed(() => ({ enEspera: this.pausadas().length, enCurso: !this.vacia() }));

  /** Corte de caja (C10.4): las ventas en espera y la venta sin cobrar no pasan al siguiente turno. */
  descartarAlCerrarTurno(): void {
    this.pausadas.set([]);
    this.cancelar();
  }

  /** C2.8: guarda la venta en "En espera" y deja la caja lista para otro cliente con un folio nuevo. */
  pausar(nota: string): void {
    if (this.vacia()) return;
    this.pausadas.update((lista) => [
      {
        folio: this.folio(),
        cliente: this.cliente(),
        lineas: this.lineasActuales(),
        descuento: this.descuentoVenta(),
        nota: nota.trim(),
        pausadaEn: new Date().toISOString(),
      },
      ...lista,
    ]);
    this.cancelar();
    this.numeroFolio.set(this.siguienteFolio++);
  }

  /** C2.9: retoma una venta pausada; si hay una venta en curso, se pausa primero. */
  retomar(folioPausada: string): void {
    const venta = this.pausadas().find((p) => p.folio === folioPausada);
    if (!venta) return;
    if (!this.vacia()) this.pausar('');
    this.pausadas.update((lista) => lista.filter((p) => p.folio !== folioPausada));
    this.lineasActuales.set(venta.lineas);
    this.cliente.set(venta.cliente);
    this.descuentoVenta.set(venta.descuento);
    this.numeroFolio.set(Number(venta.folio.slice(2)));
  }

  descartar(folioPausada: string): void {
    this.pausadas.update((lista) => lista.filter((p) => p.folio !== folioPausada));
  }

  /**
   * C2 · Cobra la venta en la API (POST /sales). El servidor pone los precios del catálogo, descuenta
   * el inventario y la registra en el turno de caja; el folio, el total y el cambio son los suyos.
   * - El descuento a toda la venta se reparte como % en cada renglón (la API descuenta por renglón).
   * - Los productos temporales (TMP-…) van como renglón libre con su precio con IVA.
   * - Con una sola forma de pago no se manda el monto: se cobra exactamente el total del servidor.
   */
  cobrarEnApi(pago: Pago, autorizacion?: { usuario: string; clave: string }): Observable<{ ok: true; cobrada: VentaCobrada } | { ok: false; mensaje: string; requiereAutorizacion?: boolean }> {
    const lineas = this.lineas();
    const d = this.descuentoVenta();
    // % extra de toda la venta: en $ se calcula sobre el total con IVA ya con los descuentos por renglón
    const extra = !d ? 0 : d.modo === '%' ? d.valor : Math.min(100, (d.valor / Math.max(0.01, this.totalSinDescuentoVenta())) * 100);
    const pct = (linea: number) => redondear(100 - (100 - linea) * (1 - extra / 100));

    const items = lineas.map((l) => {
      const producto = this.inventario.buscar(l.sku);
      if (l.disponibles === null || !producto?.id) {
        return { type: 'custom', description: `${l.nombre}${l.nota ? ` · ${l.nota}` : ''}`.slice(0, 150), unit_price: redondear(l.precio * (1 + IVA)), quantity: l.cantidad, discount_pct: pct(l.descuento) };
      }
      return { type: 'product', product_id: producto.id, quantity: l.cantidad, discount_pct: pct(l.descuento) };
    });
    const metodoApi = { efectivo: 'cash', tarjeta: 'card', transferencia: 'transfer' } as const;
    const payments =
      pago.metodo === 'mixto'
        ? (pago.partes ?? []).filter((p) => (p.monto ?? 0) > 0).map((p) => ({ method: metodoApi[p.metodo], amount: p.monto, reference: p.referencia || null }))
        : [{ method: metodoApi[pago.metodo], amount_received: pago.metodo === 'efectivo' ? pago.recibido : null, reference: pago.referencia || null }];
    const cliente = this.cliente();

    type Respuesta = { data: { folio: string; total: number; subtotal: number; tax: number; change: number } };
    return this.http
      .post<Respuesta>(`${environment.apiUrl}/sales`, {
        customer_id: /^\d+$/.test(cliente.id) ? Number(cliente.id) : null,
        items,
        payments,
        authorization: autorizacion ? { username: autorizacion.usuario, code: autorizacion.clave } : null,
      })
      .pipe(
        map((r) => {
          const cobrada: VentaCobrada = {
            folio: r.data.folio,
            total: r.data.total,
            metodo: pago.metodo,
            partes: pago.partes,
            cambio: r.data.change,
            cliente,
            imprimir: pago.imprimir,
            enviarCorreo: pago.enviarCorreo,
            facturada: pago.factura !== null,
            lineas,
            descuento: d,
            subtotal: r.data.subtotal,
            iva: r.data.tax,
            recibido: pago.recibido,
            referencia: pago.referencia,
          };
          this.cancelar();
          this.numeroFolio.set(this.siguienteFolio++);
          // El inventario y el turno cambiaron en el servidor
          this.inventario.cargar();
          return { ok: true as const, cobrada };
        }),
        catchError((e) => of({ ok: false as const, mensaje: mensajeDeError(e), requiereAutorizacion: !!erroresDeCampos(e)['authorization'] })),
      );
  }

  cobrar(pago: Pago): VentaCobrada {
    // Los datos fiscales capturados se quedan en el cliente para la próxima factura (simulado: en la lista de prueba).
    const guardado = CLIENTES.find((c) => c.id === this.cliente().id);
    if (pago.factura && guardado) guardado.fiscal = pago.factura;
    const cobrada: VentaCobrada = {
      folio: this.folio(),
      total: this.total(),
      metodo: pago.metodo,
      partes: pago.partes,
      cambio: pago.metodo === 'efectivo' || pago.metodo === 'mixto' ? Math.max(0, redondear(pago.recibido - this.total())) : 0,
      cliente: this.cliente(),
      imprimir: pago.imprimir,
      enviarCorreo: pago.enviarCorreo,
      facturada: pago.factura !== null,
      lineas: this.lineas(),
      descuento: this.descuentoVenta(),
      subtotal: this.subtotal(),
      iva: this.iva(),
      recibido: pago.recibido,
      referencia: pago.referencia,
    };
    this.cancelar();
    this.numeroFolio.set(this.siguienteFolio++);
    return cobrada;
  }
}
