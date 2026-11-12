import { Component, ElementRef, OnInit, computed, inject, output, signal, viewChild } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { formatearDinero } from '../../../compartido/formato';
import { CajaService } from '../../caja.service';
import { CorteService } from '../../corte/corte.service';
import { OrdenesService } from '../../ordenes/ordenes.service';
import { DispositivosService } from '../../punto-de-venta/dispositivos.service';
import { FORMAS_PAGO, FormaPago, IVA, LineaEntrada, PROVEEDORES, Pedido, redondear } from '../inventario.datos';
import { InventarioService, NuevaEntrada } from '../inventario.service';
import { PagoProveedorComponent } from '../pago-proveedor/pago-proveedor.component';
import { PedidosJefeComponent } from '../pedidos-jefe/pedidos-jefe.component';

interface Renglon extends LineaEntrada {
  stock: number;
}

const hoy = () => new Date().toLocaleDateString('en-CA');

/** C7.3 · Entrada de mercancía y C7.5 · Entrada contra pedido del jefe de técnicos. */
@Component({
  selector: 'app-entrada',
  standalone: true,
  imports: [PagoProveedorComponent, PedidosJefeComponent],
  templateUrl: './entrada.component.html',
  styleUrl: './entrada.component.css',
})
export class EntradaComponent implements OnInit {
  protected readonly inventario = inject(InventarioService);
  private readonly ordenes = inject(OrdenesService);
  private readonly caja = inject(CajaService);
  private readonly corte = inject(CorteService);
  private readonly dispositivos = inject(DispositivosService);
  protected readonly cajera = inject(AuthService).sesion()?.nombre ?? '';
  private readonly buscador = viewChild<ElementRef<HTMLInputElement>>('buscador');

  readonly registrada = output<string>();
  readonly aviso = output<string>();

  protected readonly dinero = formatearDinero;
  protected readonly proveedores = PROVEEDORES;
  protected readonly formas = Object.entries(FORMAS_PAGO) as [FormaPago, (typeof FORMAS_PAGO)[FormaPago]][];

  // ---------- Datos de la entrada ----------
  protected readonly pedido = signal<string | null>(null);
  protected readonly proveedor = signal(PROVEEDORES[0]);
  protected readonly documento = signal('');
  protected readonly fecha = signal(hoy());
  protected readonly renglones = signal<Renglon[]>([]);
  protected readonly pago = signal<FormaPago>('credito');
  protected readonly fotoFactura = signal(false);
  protected readonly nota = signal('');
  protected readonly intentado = signal(false);
  protected readonly pagoAbierto = signal(false);

  protected readonly pedidoElegido = computed(() => this.inventario.pedidos().find((p) => p.folio === this.pedido()) ?? null);

  ngOnInit(): void {
    const b = this.inventario.borrador();
    if (!b) return;
    this.pedido.set(b.pedido);
    this.proveedor.set(b.proveedor);
    this.documento.set(b.documento);
    this.fecha.set(b.fecha);
    this.pago.set(b.pago);
    this.fotoFactura.set(b.fotoFactura);
    this.renglones.set(b.lineas.map((l) => ({ ...l, stock: this.inventario.buscar(l.sku)?.stock ?? 0 })));
  }

  // ---------- Pedidos del jefe (C7.5) ----------
  protected elegirPedido(p: Pedido | null): void {
    this.pedido.set(p?.folio ?? null);
    this.intentado.set(false);
    if (!p) {
      this.renglones.set([]);
      this.pago.set('credito');
      return;
    }
    this.proveedor.set(p.proveedor);
    this.pago.set(p.pago);
    this.renglones.set(
      p.lineas.map((l) => {
        const producto = this.inventario.buscar(l.sku)!;
        return { sku: l.sku, nombre: producto.nombre, cantidad: l.cantidad, costo: l.costo, orden: l.orden, stock: producto.stock };
      }),
    );
  }

  // ---------- Agregar productos ----------
  protected readonly busqueda = signal('');
  protected readonly errorBusqueda = signal<string | null>(null);
  protected readonly sugerencias = computed(() => {
    const t = this.busqueda().trim().toLowerCase();
    if (!t) return [];
    return this.inventario
      .productos()
      .filter((p) => `${p.sku} ${p.nombre} ${p.codigoBarras}`.toLowerCase().includes(t))
      .slice(0, 6);
  });

  protected escribir(texto: string): void {
    this.busqueda.set(texto);
    this.errorBusqueda.set(null);
  }

  /** Enter: el lector manda el código completo; si no, el primer resultado. */
  protected enter(): void {
    const texto = this.busqueda().trim();
    if (!texto) return;
    const producto = this.inventario.porCodigo(texto) ?? this.sugerencias()[0];
    if (!producto) {
      this.errorBusqueda.set(`“${texto}” no está en el catálogo. Dalo de alta en la pestaña Catálogo y vuelve a escanearlo.`);
      return;
    }
    this.agregar(producto.sku);
  }

  protected agregar(sku: string): void {
    const p = this.inventario.buscar(sku)!;
    this.renglones.update((lista) =>
      lista.some((r) => r.sku === sku && !r.orden)
        ? lista.map((r) => (r.sku === sku && !r.orden ? { ...r, cantidad: r.cantidad + 1 } : r))
        : [...lista, { sku, nombre: p.nombre, cantidad: 1, costo: p.costo, stock: p.stock }],
    );
    this.busqueda.set('');
    this.errorBusqueda.set(null);
    this.buscador()?.nativeElement.focus();
  }

  protected cambiar(indice: number, campo: 'cantidad' | 'costo', valor: string): void {
    const numero = valor === '' ? 0 : Number(valor);
    this.renglones.update((lista) => lista.map((r, i) => (i === indice ? { ...r, [campo]: numero } : r)));
  }

  /** Clave estable del renglón (no se recrea la fila al escribir en sus campos). */
  protected clave(r: Renglon): string {
    return `${r.sku}${r.orden ?? ''}`;
  }

  protected quitar(indice: number): void {
    this.renglones.update((lista) => lista.filter((_, i) => i !== indice));
  }

  // ---------- Resumen ----------
  protected readonly piezas = computed(() => this.renglones().reduce((s, r) => s + (r.cantidad || 0), 0));
  protected readonly subtotal = computed(() => redondear(this.renglones().reduce((s, r) => s + (r.cantidad || 0) * (r.costo || 0), 0)));
  protected readonly iva = computed(() => redondear(this.subtotal() * IVA));
  protected readonly total = computed(() => redondear(this.subtotal() + this.iva()));

  /** Aviso del panel: a quién se avisa y cómo sale el pago (Figma C7.5). */
  protected readonly avisoPanel = computed(() => {
    const p = this.pedidoElegido();
    if (!p) return 'Si la factura no coincide con lo recibido, registra solo lo que llegó y anota la diferencia.';
    const partes = this.renglones()
      .filter((r) => r.orden)
      .map((r) => {
        const tecnico = this.ordenes.ordenes().find((o) => o.folio === r.orden)?.tecnico.nombre.split(' ')[0];
        return `${r.nombre} se aparta solo para ${r.orden} y se avisa a ${tecnico ? `${tecnico} y ` : ''}${p.jefe.split(' ')[0]}.`;
      });
    if (this.pago() === 'efectivo') partes.push(`El pago sale como “Pago a proveedor ${p.folio}”.`);
    else if (this.pago() === 'transferencia') partes.push('Gerencia paga la transferencia; en caja no sale efectivo.');
    return partes.join(' ');
  });

  protected readonly errores = computed(() => {
    const e: Record<string, string> = {};
    if (!this.documento().trim()) e['documento'] = 'Escribe el folio de la factura o remisión';
    else {
      const repetida = this.inventario.entradas().find((x) => x.proveedor === this.proveedor() && x.documento.toUpperCase() === this.documento().trim().toUpperCase());
      if (repetida) e['documento'] = `Ya se registró en ${repetida.folio}`;
    }
    if (!this.renglones().length) e['lineas'] = 'Agrega al menos un producto';
    else if (this.renglones().some((r) => !Number.isInteger(r.cantidad) || r.cantidad <= 0)) e['lineas'] = 'Cada cantidad debe ser de 1 pieza o más';
    else if (this.renglones().some((r) => !(r.costo > 0))) e['lineas'] = 'Falta el costo unitario de algún producto';
    if (this.pago() === 'efectivo' && !this.caja.abierta()) e['pago'] = 'Abre el turno de caja para pagar en efectivo';
    else if (this.pago() === 'efectivo' && this.total() > this.corte.efectivoEnCaja()) e['pago'] = `En caja solo hay ${formatearDinero(this.corte.efectivoEnCaja())}`;
    return e;
  });

  protected error(campo: string): string | null {
    return this.intentado() ? (this.errores()[campo] ?? null) : null;
  }

  // ---------- Registrar ----------
  private datos(): NuevaEntrada {
    return {
      proveedor: this.proveedor(),
      documento: this.documento().trim().toUpperCase(),
      fecha: new Date(`${this.fecha()}T${new Date().toTimeString().slice(0, 8)}`).toISOString(),
      pedido: this.pedido(),
      lineas: this.renglones().map(({ stock: _stock, ...l }) => l),
      pago: this.pago(),
      recibio: this.cajera,
      fotoFactura: this.fotoFactura(),
      nota: this.nota().trim() || undefined,
    };
  }

  protected registrar(): void {
    this.intentado.set(true);
    if (Object.keys(this.errores()).length) return;
    if (this.pago() === 'efectivo') this.pagoAbierto.set(true);
    else this.confirmar(null);
  }

  /** Con pago en efectivo llega desde el modal C7.6 con lo entregado al repartidor. */
  protected confirmar(entregado: number | null): void {
    const datos = this.datos();
    const entrada = this.inventario.registrarEntrada(datos);
    for (const r of datos.lineas.filter((l) => l.orden)) this.ordenes.refaccionRecibida(r.orden!, r.nombre, entrada.folio);
    const partes = [`${entrada.folio} registrada: ${this.piezas()} ${this.piezas() === 1 ? 'pieza' : 'piezas'} de ${entrada.proveedor} (${formatearDinero(entrada.total)})`];
    if (entregado !== null) {
      this.caja.pagarProveedor({ proveedor: entrada.proveedor, documento: entrada.documento, pedido: entrada.pedido, monto: entrada.total });
      partes.push(`pago en efectivo, cambio ${formatearDinero(redondear(entregado - entrada.total))}`);
      if (!this.dispositivos.imprimir(entrada.folio)) partes.push('no se pudo imprimir el comprobante');
    }
    const apartadas = datos.lineas.filter((l) => l.orden).map((l) => l.orden);
    if (apartadas.length) partes.push(`apartado para ${apartadas.join(', ')}`);
    this.pagoAbierto.set(false);
    this.registrada.emit(partes.join(' · '));
  }

  protected guardarBorrador(): void {
    this.inventario.borrador.set(this.datos());
    this.aviso.emit('Borrador guardado: lo encontrarás al volver a Entradas de mercancía.');
  }

  protected descartarBorrador(): void {
    this.inventario.borrador.set(null);
    this.elegirPedido(null);
    this.documento.set('');
    this.nota.set('');
    this.fotoFactura.set(false);
  }
}
