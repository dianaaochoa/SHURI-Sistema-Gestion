import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, catchError, concatMap, forkJoin, from, last, map, of, shareReplay, tap, toArray } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../acceso/auth.service';
import { mensajeDeError } from '../../api/errores-api';
import { MovimientoApi, PREFIJO_USO_INTERNO, ProductoApi, TIPO_DE_CATEGORIA, ajusteDeApi, movimientoDeApi, productoDeApi } from './inventario.api';
import {
  AJUSTES_DEMO,
  Ajuste,
  ENTRADAS_DEMO,
  Entrada,
  FormaPago,
  IVA,
  LineaEntrada,
  PEDIDOS_DEMO,
  PRODUCTOS_DEMO,
  Pedido,
  ProductoInventario,
  TipoAjuste,
  redondear,
} from './inventario.datos';

export type EstadoStock = 'agotado' | 'bajo' | 'justo' | 'suficiente';

/** Piezas que se pueden vender: stock menos lo apartado para reparaciones (regla de Figma C7). */
export function disponible(p: ProductoInventario): number {
  return Math.max(0, p.stock - apartadas(p));
}

export function apartadas(p: ProductoInventario): number {
  return p.apartados.reduce((s, a) => s + a.cantidad, 0);
}

/**
 * Color de la pastilla de stock: sin disponibles (advertencia), en o bajo el mínimo (peligro),
 * hasta el doble del mínimo (neutro) o suficiente (éxito).
 */
export function estadoStock(p: ProductoInventario): EstadoStock {
  if (disponible(p) === 0) return 'agotado';
  if (p.stock <= p.minimo) return 'bajo';
  if (p.stock <= p.minimo * 2) return 'justo';
  return 'suficiente';
}

/** Margen sobre el precio sin IVA: (precio/1.16 − costo) / (precio/1.16). */
export function margen(costo: number, precio: number): { porcentaje: number; importe: number } {
  const neto = precio / (1 + IVA);
  const importe = redondear(neto - costo);
  return { porcentaje: neto > 0 ? Math.round((importe / neto) * 100) : 0, importe };
}

export interface Movimiento {
  fecha: string;
  texto: string;
  /** Piezas que entraron (+) o salieron (−). */
  cantidad: number;
  folio: string;
}

export interface CambioPrecio {
  fecha: string;
  sku: string;
  nombre: string;
  antes: number;
  despues: number;
  motivo: string;
  por: string;
}

export interface NuevaEntrada {
  proveedor: string;
  documento: string;
  fecha: string;
  pedido: string | null;
  lineas: LineaEntrada[];
  pago: FormaPago;
  recibio: string;
  fotoFactura: boolean;
  nota?: string;
}

/** Resultado de una acción que va a la API. */
export type ResultadoInventario<T = undefined> = { ok: true; valor: T; mensaje: string } | { ok: false; mensaje: string };

/**
 * Inventario de la sucursal (C7, J6, AD4). Con una sesión del personal con `inventory.view`, el
 * catálogo, los ajustes y el kardex salen de la API; el alta, la edición, los precios, los ajustes y
 * las entradas van al servidor. Las piezas apartadas para órdenes, los pedidos del jefe y el historial
 * de entradas con proveedor siguen en el navegador hasta conectar Compras; sin sesión se usan los datos de prueba.
 */
@Injectable({ providedIn: 'root' })
export class InventarioService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly api = environment.apiUrl;

  readonly productos = signal<ProductoInventario[]>(PRODUCTOS_DEMO);
  readonly entradas = signal<Entrada[]>(ENTRADAS_DEMO);
  readonly ajustes = signal<Ajuste[]>(AJUSTES_DEMO);
  readonly pedidos = signal<Pedido[]>(PEDIDOS_DEMO);
  /** “Guardar borrador” de la entrada de mercancía (C7.3). */
  readonly borrador = signal<NuevaEntrada | null>(null);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  /** true cuando el catálogo viene de la API. */
  private readonly desdeApi = signal(false);
  readonly conApi = this.desdeApi.asReadonly();
  /** Categorías de la API (para elegir la de cada tipo al dar de alta). */
  private categorias: { id: number; name: string; type: ProductoApi['type'] }[] = [];
  private proveedoresApi: { id: number; name: string }[] = [];
  /** Kardex por SKU (C7.6), se carga al abrir los movimientos del producto. */
  private readonly kardex = signal<Record<string, Movimiento[]>>({});

  constructor() {
    effect(() => {
      const permisos = this.auth.sesion()?.permisos ?? [];
      untracked(() => {
        if (permisos.includes('inventory.view')) {
          this.cargar();
        } else if (this.desdeApi()) {
          this.desdeApi.set(false);
          this.productos.set(PRODUCTOS_DEMO);
          this.ajustes.set(AJUSTES_DEMO);
          this.kardex.set({});
        }
      });
    });
  }

  readonly stockBajo = computed(() => this.productos().filter((p) => estadoStock(p) === 'bajo').length);
  readonly sinExistencias = computed(() => this.productos().filter((p) => estadoStock(p) === 'agotado').length);

  /** Catálogo completo, categorías, proveedores y los ajustes (movimientos de ajuste y merma). */
  cargar(): void {
    this.cargando.set(true);
    const permisos = this.auth.sesion()?.permisos ?? [];
    this.http.get<{ data: ProductoApi[] }>(`${this.api}/products`, { params: { per_page: 500, include_inactive: 0 } }).subscribe({
      next: (r) => {
        // Lo apartado para órdenes todavía vive en el navegador: se conserva al recargar
        const apartados = new Map(this.productos().map((p) => [p.sku, p.apartados]));
        this.productos.set(r.data.map((p) => productoDeApi(p, this.desdeApi() ? (apartados.get(p.sku) ?? []) : [])));
        this.desdeApi.set(true);
        this.error.set(null);
        this.cargando.set(false);
        this.cargarAjustes();
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
    this.http.get<{ data: { id: number; name: string; type: ProductoApi['type'] }[] }>(`${this.api}/categories`).subscribe({ next: (r) => (this.categorias = r.data), error: () => undefined });
    if (permisos.some((p) => ['suppliers.manage', 'purchasing.orders', 'inventory.stock_in'].includes(p))) {
      this.http.get<{ data: { id: number; name: string }[] }>(`${this.api}/suppliers`).subscribe({ next: (r) => (this.proveedoresApi = r.data), error: () => undefined });
    }
  }

  /** C7.4 · Historial de ajustes: conteos, mermas y uso interno. */
  private cargarAjustes(): void {
    const tipos = ['adjustment', 'shrinkage'] as const;
    forkJoin(tipos.map((type) => this.http.get<{ data: MovimientoApi[] }>(`${this.api}/inventory/movements`, { params: { type, per_page: 500 } }))).subscribe({
      next: (respuestas) => {
        const costos = new Map(this.productos().map((p) => [p.sku, p.costo]));
        const lista = respuestas.flatMap((r) => r.data).map((m) => ajusteDeApi(m, costos.get(m.product?.sku ?? '') ?? 0));
        this.ajustes.set(lista.sort((a, b) => b.fecha.localeCompare(a.fecha)));
      },
      error: () => undefined,
    });
  }

  buscar(sku: string): ProductoInventario | undefined {
    return this.productos().find((p) => p.sku === sku);
  }

  /** Busca por SKU o código de barras exacto (lo que escribe el lector). */
  porCodigo(texto: string): ProductoInventario | undefined {
    const t = texto.trim().toUpperCase();
    return this.productos().find((p) => p.sku.toUpperCase() === t || p.codigoBarras === t);
  }

  /** Reemplaza (o agrega) el producto con lo que devolvió la API. */
  private ponerProducto(p: ProductoApi): ProductoInventario {
    const anterior = this.buscar(p.sku) ?? this.productos().find((x) => x.id === p.id);
    const producto = productoDeApi(p, anterior?.apartados ?? []);
    // Sin el costo en la respuesta (caja), se conserva el que ya se tenía
    if (p.purchase_price === undefined && anterior) producto.costo = anterior.costo;
    this.productos.update((lista) => (anterior ? lista.map((x) => (x === anterior ? producto : x)) : [producto, ...lista]));
    return producto;
  }

  /** Dispara la petición aunque nadie se suscriba y comparte el resultado. */
  private enviar<T>(peticion: Observable<ResultadoInventario<T>>): Observable<ResultadoInventario<T>> {
    const r = peticion.pipe(
      catchError((e) => of<ResultadoInventario<T>>({ ok: false, mensaje: mensajeDeError(e) })),
      shareReplay(1),
    );
    r.subscribe();
    return r;
  }

  /** J3.2 · Aparta piezas para una orden (reemplaza lo que ya tuviera apartado esa orden). */
  apartar(sku: string, cantidad: number, folio: string): void {
    this.productos.update((lista) =>
      lista.map((p) => (p.sku === sku ? { ...p, apartados: [...p.apartados.filter((a) => a.folio !== folio), { cantidad, folio }] } : p)),
    );
  }

  /** T3.9 · La orden no se repara: lo apartado para ella vuelve a estar disponible. */
  liberar(folio: string): void {
    this.productos.update((lista) => lista.map((p) => (p.apartados.some((a) => a.folio === folio) ? { ...p, apartados: p.apartados.filter((a) => a.folio !== folio) } : p)));
  }

  /** Piezas que puede usar una orden: stock menos lo apartado para otras órdenes. */
  paraOrden(sku: string, folio: string): number {
    const p = this.buscar(sku);
    return p ? Math.max(0, p.stock - p.apartados.filter((a) => a.folio !== folio).reduce((s, a) => s + a.cantidad, 0)) : 0;
  }

  /** Fecha de llegada del pedido al proveedor que trae esa pieza (C7.5), si hay uno. */
  llegada(sku: string): string | null {
    return this.pedidos().find((p) => p.lineas.some((l) => l.sku === sku))?.llega ?? null;
  }

  // ---------- Pedidos y piezas del taller (J5) ----------
  /** Folio que tendrá el siguiente pedido (sigue a los pedidos pendientes y a los ya recibidos). */
  siguientePedido(): string {
    const folios = [...this.pedidos().map((p) => p.folio), ...this.entradas().map((e) => e.pedido ?? '')].filter((f) => f.startsWith('PED-'));
    return `PED-${String(Math.max(124, ...folios.map((f) => Number(f.slice(4)))) + 1).padStart(4, '0')}`;
  }

  /** J5.2 / J5.5 · El jefe registra un pedido; caja lo verá en "Pedidos por recibir" (C7.5). */
  registrarPedido(datos: Omit<Pedido, 'folio' | 'creado'>): Pedido {
    const pedido: Pedido = { ...datos, folio: this.siguientePedido(), creado: new Date().toISOString() };
    this.pedidos.update((lista) => [...lista, pedido]);
    return pedido;
  }

  /** J5.1 · Entrega piezas al técnico: salen del stock y se libera lo apartado para esa orden. */
  surtir(sku: string, cantidad: number, folio: string): void {
    this.productos.update((lista) =>
      lista.map((p) => {
        if (p.sku !== sku) return p;
        const apartados = p.apartados
          .map((a) => (a.folio === folio ? { ...a, cantidad: a.cantidad - cantidad } : a))
          .filter((a) => a.cantidad > 0);
        return { ...p, stock: Math.max(0, p.stock - cantidad), apartados };
      }),
    );
  }

  /** Venta (−), cancelación o devolución en buen estado (+) desde caja (C2 / C3). Lo que no está en Inventario se ignora. */
  moverStock(sku: string, cambio: number): void {
    this.productos.update((lista) => lista.map((p) => (p.sku === sku ? { ...p, stock: Math.max(0, p.stock + cambio) } : p)));
  }

  /** J5.3 · Una pieza que regresa del taller vuelve al stock. */
  devolver(sku: string, cantidad: number): void {
    this.productos.update((lista) => lista.map((p) => (p.sku === sku ? { ...p, stock: p.stock + cantidad } : p)));
  }

  // ---------- Precios del administrador (AD4) ----------
  /** Cambios de precio hechos en esta sesión (los leerá la bitácora, AD8; en la API quedan en price_histories). */
  readonly cambiosPrecio = signal<CambioPrecio[]>([]);

  /** Costo de cada compra del producto, de la más reciente a la más antigua (AD4.2 "Historial de costo"). */
  historialCosto(sku: string): { fecha: string; documento: string; costo: number }[] {
    return this.entradas()
      .flatMap((e) => e.lineas.filter((l) => l.sku === sku).map((l) => ({ fecha: e.fecha, documento: e.pedido ?? e.folio, costo: l.costo })))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  private proveedorId(nombre: string): number | null {
    return this.proveedoresApi.find((p) => p.name.toLowerCase() === nombre.trim().toLowerCase())?.id ?? null;
  }

  /** AD4.2 · Precio, mínimo y proveedor principal de un producto (PUT /products/{id}). */
  cambiarPrecio(sku: string, datos: { precio: number; minimo: number; proveedor: string }, por: string): Observable<ResultadoInventario> {
    const antes = this.buscar(sku);
    if (!antes) return of({ ok: false, mensaje: 'No existe el producto.' });
    const anotar = () => {
      if (antes.precio !== datos.precio)
        this.cambiosPrecio.update((l) => [{ fecha: new Date().toISOString(), sku, nombre: antes.nombre, antes: antes.precio, despues: redondear(datos.precio), motivo: 'Precio editado', por }, ...l]);
    };
    if (!this.desdeApi() || !antes.id) {
      this.productos.update((lista) => lista.map((p) => (p.sku === sku ? { ...p, ...datos, precio: redondear(datos.precio) } : p)));
      anotar();
      return of({ ok: true, valor: undefined, mensaje: '' });
    }
    return this.enviar(
      this.http
        .put<{ message: string; data: ProductoApi }>(`${this.api}/products/${antes.id}`, {
          sale_price: redondear(datos.precio),
          min_stock: datos.minimo,
          supplier_id: this.proveedorId(datos.proveedor),
          price_change_reason: `Precio editado por ${por}`,
        })
        .pipe(
          map((r): ResultadoInventario => {
            this.ponerProducto(r.data);
            anotar();
            return { ok: true, valor: undefined, mensaje: r.message };
          }),
        ),
    );
  }

  /** AD4.3 · Ajuste de precios en grupo (un PUT por producto, uno tras otro). */
  ajustarPrecios(cambios: { sku: string; precio: number }[], motivo: string, por: string): Observable<ResultadoInventario> {
    const nuevos = new Map(cambios.map((c) => [c.sku, redondear(c.precio)]));
    const fecha = new Date().toISOString();
    const registro = this.productos()
      .filter((p) => nuevos.has(p.sku) && nuevos.get(p.sku) !== p.precio)
      .map((p) => ({ fecha, sku: p.sku, nombre: p.nombre, antes: p.precio, despues: nuevos.get(p.sku)!, motivo, por }));
    if (!this.desdeApi()) {
      this.productos.update((lista) => lista.map((p) => (nuevos.has(p.sku) ? { ...p, precio: nuevos.get(p.sku)! } : p)));
      this.cambiosPrecio.update((l) => [...registro, ...l]);
      return of({ ok: true, valor: undefined, mensaje: '' });
    }
    const productos = registro.map((r) => this.buscar(r.sku)).filter((p): p is ProductoInventario => !!p?.id);
    if (!productos.length) return of({ ok: true, valor: undefined, mensaje: '' });
    return this.enviar(
      from(productos).pipe(
        concatMap((p) => this.http.put<{ data: ProductoApi }>(`${this.api}/products/${p.id}`, { sale_price: nuevos.get(p.sku), price_change_reason: motivo.slice(0, 255) })),
        tap((r) => this.ponerProducto(r.data)),
        toArray(),
        map((): ResultadoInventario => {
          this.cambiosPrecio.update((l) => [...registro, ...l]);
          return { ok: true, valor: undefined, mensaje: `${productos.length} precios actualizados.` };
        }),
      ),
    );
  }

  // ---------- Alta y edición (C7.1) ----------
  /** Cuerpo de POST/PUT /products. Sin el permiso de precios, la edición no los manda. */
  private cuerpoProducto(p: ProductoInventario, alta: boolean): Record<string, unknown> {
    const tipo = TIPO_DE_CATEGORIA[p.categoria] ?? 'accessory';
    const anterior = alta ? undefined : this.productos().find((x) => x.id === p.id);
    const categoria = this.categorias.find((c) => c.type === tipo);
    const cuerpo: Record<string, unknown> = {
      sku: p.sku,
      barcode: p.codigoBarras.trim() || null,
      name: p.nombre.trim(),
      type: tipo,
      supplier_id: this.proveedorId(p.proveedor),
      sellable_at_counter: !p.usoInterno,
      usable_in_workshop: tipo !== 'accessory' || !!p.usoInterno,
      min_stock: p.minimo,
      location: p.ubicacion.trim() || null,
    };
    // La categoría solo cambia si cambió el tipo (las de la API son más finas: Pantallas, Baterías…)
    if (categoria && (alta || TIPO_DE_CATEGORIA[anterior?.categoria ?? ''] !== tipo)) cuerpo['category_id'] = categoria.id;
    const puedePrecios = (this.auth.sesion()?.permisos ?? []).includes('catalog.prices');
    if (alta) {
      Object.assign(cuerpo, { purchase_price: p.costo, sale_price: redondear(p.precio), initial_stock: p.stock });
    } else if (puedePrecios && anterior && (anterior.precio !== p.precio || anterior.costo !== p.costo)) {
      Object.assign(cuerpo, { purchase_price: p.costo, sale_price: redondear(p.precio), price_change_reason: 'Edición del producto' });
    }
    return cuerpo;
  }

  guardar(producto: ProductoInventario, skuOriginal: string | null): Observable<ResultadoInventario<ProductoInventario>> {
    if (!this.desdeApi()) {
      this.productos.update((lista) =>
        skuOriginal ? lista.map((p) => (p.sku === skuOriginal ? { ...producto, apartados: p.apartados } : p)) : [producto, ...lista],
      );
      return of({ ok: true, valor: producto, mensaje: '' });
    }
    const original = skuOriginal ? this.buscar(skuOriginal) : undefined;
    const peticion = original?.id
      ? this.http.put<{ message: string; data: ProductoApi }>(`${this.api}/products/${original.id}`, this.cuerpoProducto({ ...producto, id: original.id }, false))
      : this.http.post<{ message: string; data: ProductoApi }>(`${this.api}/products`, this.cuerpoProducto(producto, true));
    return this.enviar(peticion.pipe(map((r) => ({ ok: true as const, valor: this.ponerProducto(r.data), mensaje: r.message }))));
  }

  // ---------- Importar desde Excel (C7.2) ----------
  /**
   * Nuevos → alta; existentes → edición de datos y, si se pide, entrada de las piezas.
   * En la API va uno por uno; si uno falla, se detiene y se avisa cuál.
   */
  importar(filas: ProductoInventario[], sumarStock: boolean): Observable<ResultadoInventario<number>> {
    if (!this.desdeApi()) {
      this.productos.update((lista) => {
        const nueva = [...lista];
        for (const fila of filas) {
          const i = nueva.findIndex((p) => p.sku === fila.sku);
          if (i < 0) nueva.unshift(fila);
          else {
            const actual = nueva[i];
            nueva[i] = { ...actual, nombre: fila.nombre, categoria: fila.categoria, costo: fila.costo, precio: fila.precio, stock: sumarStock ? actual.stock + fila.stock : fila.stock };
          }
        }
        return nueva;
      });
      return of({ ok: true, valor: filas.length, mensaje: '' });
    }
    if (!filas.length) return of({ ok: true, valor: 0, mensaje: '' });
    const pasos = filas.map((fila) => {
      const actual = this.buscar(fila.sku);
      if (!actual?.id) return this.http.post<{ data: ProductoApi }>(`${this.api}/products`, this.cuerpoProducto(fila, true)).pipe(tap((r) => this.ponerProducto(r.data)));
      const edicion = this.http.put<{ data: ProductoApi }>(`${this.api}/products/${actual.id}`, this.cuerpoProducto({ ...fila, id: actual.id, minimo: actual.minimo, ubicacion: actual.ubicacion }, false));
      const piezas = sumarStock ? fila.stock : fila.stock - actual.stock;
      return edicion.pipe(
        tap((r) => this.ponerProducto(r.data)),
        concatMap((r) =>
          piezas > 0
            ? this.http.post<{ product: ProductoApi }>(`${this.api}/inventory/stock-in`, { product_id: actual.id, quantity: piezas, reason: 'Importación desde Excel' }).pipe(tap((m) => this.ponerProducto(m.product)))
            : of(r),
        ),
      );
    });
    return this.enviar(
      from(pasos).pipe(
        concatMap((paso) => paso),
        toArray(),
        map((r) => ({ ok: true as const, valor: r.length, mensaje: `${r.length} productos importados.` })),
      ),
    );
  }

  // ---------- Entradas de mercancía (C7.3 / C7.5) ----------
  siguienteEntrada(): string {
    const max = Math.max(0, ...this.entradas().map((e) => Number(e.folio.slice(4))));
    return `ENT-${String(max + 1).padStart(4, '0')}`;
  }

  /**
   * Registra la entrada. En la API cada renglón entra al kardex (POST /inventory/stock-in) con el
   * proveedor y el documento en la nota; el registro con proveedor, pago y factura llega con Compras.
   */
  registrarEntrada(datos: NuevaEntrada): Observable<ResultadoInventario<Entrada>> {
    const subtotal = redondear(datos.lineas.reduce((s, l) => s + l.cantidad * l.costo, 0));
    const iva = redondear(subtotal * IVA);
    const entrada: Entrada = { ...datos, folio: this.siguienteEntrada(), subtotal, iva, total: redondear(subtotal + iva) };
    const local = () => {
      this.entradas.update((lista) => [entrada, ...lista]);
      if (datos.pedido) this.pedidos.update((lista) => lista.filter((p) => p.folio !== datos.pedido));
      this.borrador.set(null);
      // Lo que viene para una orden queda apartado
      for (const l of datos.lineas.filter((x) => x.orden)) {
        const p = this.buscar(l.sku);
        if (p) this.apartar(l.sku, (p.apartados.find((a) => a.folio === l.orden)?.cantidad ?? 0) + l.cantidad, l.orden!);
      }
    };

    if (!this.desdeApi()) {
      // Stock nuevo y costo promedio ponderado
      this.productos.update((lista) =>
        lista.map((p) => {
          const lineas = datos.lineas.filter((l) => l.sku === p.sku);
          if (!lineas.length) return p;
          let { stock, costo } = p;
          for (const l of lineas) {
            costo = stock + l.cantidad > 0 ? redondear((stock * costo + l.cantidad * l.costo) / (stock + l.cantidad)) : l.costo;
            stock += l.cantidad;
          }
          return { ...p, stock, costo };
        }),
      );
      local();
      return of({ ok: true, valor: entrada, mensaje: '' });
    }

    const nota = `Entrada ${datos.documento} · ${datos.proveedor}`.slice(0, 255);
    const lineas = datos.lineas.filter((l) => this.buscar(l.sku)?.id && l.cantidad > 0);
    if (!lineas.length) return of({ ok: false, mensaje: 'Agrega al menos un producto del catálogo.' });
    return this.enviar(
      from(lineas).pipe(
        concatMap((l) =>
          this.http
            .post<{ product: ProductoApi }>(`${this.api}/inventory/stock-in`, { product_id: this.buscar(l.sku)!.id, quantity: l.cantidad, reason: l.orden ? `${nota} · para ${l.orden}` : nota })
            .pipe(tap((r) => this.ponerProducto(r.product))),
        ),
        last(),
        map((): ResultadoInventario<Entrada> => {
          local();
          return { ok: true, valor: entrada, mensaje: '' };
        }),
      ),
    );
  }

  // ---------- Ajustes (C7.4) ----------
  /**
   * POST /inventory/adjustments deja el stock igual a lo contado: se manda stock + diferencia.
   * La merma va con is_shrinkage; el uso interno lleva su prefijo en el motivo.
   */
  aplicarAjuste(sku: string, tipo: TipoAjuste, diferencia: number, motivo: string, hizo: string): Observable<ResultadoInventario<Ajuste>> {
    const producto = this.buscar(sku)!;
    const folioLocal = `AJ-${String(Math.max(0, ...this.ajustes().map((a) => Number(a.folio.slice(3)) || 0)) + 1).padStart(4, '0')}`;
    const ajuste: Ajuste = { folio: folioLocal, fecha: new Date().toISOString(), sku, nombre: producto.nombre, tipo, diferencia, stockAntes: producto.stock, valor: redondear(diferencia * producto.costo), motivo, hizo };

    if (!this.desdeApi() || !producto.id) {
      this.productos.update((lista) => lista.map((p) => (p.sku === sku ? { ...p, stock: p.stock + diferencia } : p)));
      this.ajustes.update((lista) => [ajuste, ...lista]);
      return of({ ok: true, valor: ajuste, mensaje: '' });
    }
    return this.enviar(
      this.http
        .post<{ message: string; movement: MovimientoApi; product: ProductoApi }>(`${this.api}/inventory/adjustments`, {
          product_id: producto.id,
          counted_stock: producto.stock + diferencia,
          reason: (tipo === 'interno' ? PREFIJO_USO_INTERNO + motivo : motivo).slice(0, 255),
          is_shrinkage: tipo === 'merma',
        })
        .pipe(
          map((r) => {
            this.ponerProducto(r.product);
            const guardado = ajusteDeApi({ ...r.movement, product: { id: producto.id!, sku, name: producto.nombre } }, producto.costo);
            this.ajustes.update((lista) => [guardado, ...lista]);
            this.cargarKardex(sku);
            return { ok: true as const, valor: guardado, mensaje: r.message };
          }),
        ),
    );
  }

  /** Kardex del producto (C7.6): con la API se pide al abrir sus movimientos. */
  cargarKardex(sku: string): void {
    const p = this.buscar(sku);
    if (!this.desdeApi() || !p?.id) return;
    this.http.get<{ data: MovimientoApi[] }>(`${this.api}/inventory/movements`, { params: { product_id: p.id, per_page: 500 } }).subscribe({
      next: (r) => this.kardex.update((k) => ({ ...k, [sku]: r.data.map(movimientoDeApi) })),
      error: () => undefined,
    });
  }

  /** Historial de un producto: con la API, su kardex completo; con datos de prueba, entradas y ajustes. */
  movimientos(sku: string): Movimiento[] {
    if (this.desdeApi()) return this.kardex()[sku] ?? [];
    const entradas = this.entradas().flatMap((e) =>
      e.lineas.filter((l) => l.sku === sku).map((l) => ({ fecha: e.fecha, texto: `Entrada · ${e.proveedor}${l.orden ? ` · aparta ${l.orden}` : ''}`, cantidad: l.cantidad, folio: e.folio })),
    );
    const ajustes = this.ajustes()
      .filter((a) => a.sku === sku)
      .map((a) => ({ fecha: a.fecha, texto: `Ajuste · ${a.motivo}`, cantidad: a.diferencia, folio: a.folio }));
    return [...entradas, ...ajustes].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }
}
