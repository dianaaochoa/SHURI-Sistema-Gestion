import { Component, computed, inject, signal } from '@angular/core';
import { formatearDinero } from '../../compartido/formato';
import { CajaService } from '../../cajera/caja.service';
import { Entrada, FORMAS_PAGO } from '../../cajera/inventario/inventario.datos';
import { InventarioService } from '../../cajera/inventario/inventario.service';
import { RefaccionesService } from '../../jefe/refacciones/refacciones.service';
import { exportarCsv } from '../reportes';
import { CONDICIONES, Factura, ProveedoresService } from '../proveedores.service';
import { NuevoProveedorComponent } from './nuevo-proveedor/nuevo-proveedor.component';
import { RegistrarPagoComponent } from './registrar-pago/registrar-pago.component';

const DIA = 86_400_000;
const diaMes = (f: Date | string) => {
  const d = new Date(f);
  return `${d.getDate()} ${d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;
};

/** AD5.1 · Proveedores: lista, compras recientes y lo que se debe (AD5.2 registrar pago, AD5.3 nuevo proveedor). */
@Component({
  selector: 'app-proveedores-admin',
  standalone: true,
  imports: [RegistrarPagoComponent, NuevoProveedorComponent],
  templateUrl: './proveedores-admin.component.html',
  styleUrls: ['../reportes.css', './proveedores-admin.component.css'],
})
export class ProveedoresAdminComponent {
  protected readonly servicio = inject(ProveedoresService);
  private readonly inventario = inject(InventarioService);
  private readonly caja = inject(CajaService);
  private readonly refacciones = inject(RefaccionesService);

  protected readonly elegido = signal('Distribuidora MovilTec');
  protected readonly pagando = signal<Factura | null>(null);
  protected readonly nuevo = signal(false);
  protected readonly aviso = signal('');

  private readonly hoy = new Date();
  private readonly enMes = (iso: string) => {
    const f = new Date(iso);
    return f.getMonth() === this.hoy.getMonth() && f.getFullYear() === this.hoy.getFullYear();
  };
  protected readonly mes = this.hoy.toLocaleDateString('es-MX', { month: 'long' });

  protected readonly indicadores = computed(() => {
    const facturas = this.servicio.porPagar();
    const delMes = this.inventario.entradas().filter((e) => this.enMes(e.fecha));
    const deCaja = this.caja.pagosAProveedor().filter((p) => this.enMes(p.fecha));
    // Las entradas pagadas en efectivo ya dejan su pago a proveedor en caja; no se cuentan dos veces.
    const enEfectivo = delMes.filter((e) => e.pago === 'efectivo');
    const efectivo = enEfectivo.reduce((s, e) => s + e.total, 0) + deCaja.filter((p) => !enEfectivo.some((e) => e.documento === p.documento)).reduce((s, p) => s + p.monto, 0);
    const incompleto = this.inventario.entradas().filter((e) => e.faltan);
    return [
      { valor: formatearDinero(facturas.reduce((s, f) => s + f.saldo, 0), true), tono: 'advertencia', titulo: 'Por pagar', detalle: `${facturas.length} ${facturas.length === 1 ? 'factura' : 'facturas'} a crédito` },
      { valor: formatearDinero(delMes.reduce((s, e) => s + e.total, 0), true), tono: '', titulo: 'Comprado este mes', detalle: `${delMes.length} ${delMes.length === 1 ? 'entrada' : 'entradas'} de mercancía` },
      { valor: formatearDinero(efectivo, true), tono: 'primario', titulo: 'Pagado desde caja', detalle: 'Pagos a proveedor' },
      { valor: `${incompleto.length}`, tono: 'peligro', titulo: incompleto.length === 1 ? 'Pedido incompleto' : 'Pedidos incompletos', detalle: incompleto.map((e) => e.pedido ?? e.documento).join(', ') || 'Ninguno' },
    ];
  });

  protected readonly filas = computed(() =>
    this.servicio.proveedores().map((p) => ({
      p,
      contacto: [p.contacto, p.telefono].filter(Boolean).join(' · ') || p.correo || '—',
      condicion: CONDICIONES[p.condicion].texto,
      deuda: this.servicio.deudaDe(p.nombre),
    })),
  );

  /** Últimas 6 entradas de mercancía con cómo se pagaron y su estado. */
  protected readonly compras = computed(() =>
    [...this.inventario.entradas()]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 6)
      .map((e) => ({ e, fecha: diaMes(e.fecha), ...this.estadoCompra(e) })),
  );

  private estadoCompra(e: Entrada): { origen: string; pago: string; estado: { texto: string; tono: string } } {
    const origen = e.pedido ? `${e.pedido} · caja` : 'Entrada de caja';
    if (e.pago !== 'credito') return { origen, pago: FORMAS_PAGO[e.pago].corto, estado: { texto: 'Pagado', tono: 'exito' } };
    const factura = this.servicio.porPagar().find((f) => f.entrada.folio === e.folio);
    if (!factura) return { origen, pago: 'Crédito', estado: { texto: 'Pagado', tono: 'exito' } };
    const vencida = factura.vence.getTime() < this.hoy.getTime();
    return {
      origen,
      pago: `Crédito · vence ${diaMes(factura.vence)}`,
      estado: { texto: factura.pagado ? `Parcial ${formatearDinero(factura.saldo, true)}` : vencida ? 'Vencido' : 'Por pagar', tono: vencida ? 'peligro' : 'advertencia' },
    };
  }

  /** Panel derecho: el proveedor elegido. */
  protected readonly detalle = computed(() => {
    const p = this.servicio.buscar(this.elegido());
    if (!p) return null;
    const facturas = this.servicio.porPagar().filter((f) => f.entrada.proveedor === p.nombre);
    const comprado = this.inventario.entradas().filter((e) => e.proveedor === p.nombre && this.enMes(e.fecha)).reduce((s, e) => s + e.total, 0);
    const proxima = facturas[0];
    const dias = proxima ? Math.ceil((proxima.vence.getTime() - Date.now()) / DIA) : 0;
    const incompletos = this.inventario.entradas().filter((e) => e.proveedor === p.nombre && e.nota && e.faltan);
    return {
      p,
      datos: [
        ['RFC', p.rfc || '—'],
        ['Condición', CONDICIONES[p.condicion].texto],
        [`Comprado en ${this.mes}`, formatearDinero(comprado)],
        ['Por pagar', formatearDinero(facturas.reduce((s, f) => s + f.saldo, 0))],
        ['Vence', proxima ? `${diaMes(proxima.vence)} · ${dias < 0 ? `vencida hace ${-dias} días` : `en ${dias} días`}` : '—'],
      ],
      proxima,
      avisos: incompletos.map((e) => `${e.nota}${this.refacciones.reclamados().includes(e.pedido ?? '') ? ' El jefe ya lo reclamó.' : ''}`),
    };
  });

  protected dinero(n: number, sinCentavos = false): string {
    return formatearDinero(n, sinCentavos);
  }

  protected pagado(texto: string): void {
    this.pagando.set(null);
    this.aviso.set(texto);
  }

  protected guardado(nombre: string): void {
    this.nuevo.set(false);
    this.elegido.set(nombre);
    this.aviso.set(`${nombre} dado de alta: ya aparece en los pedidos del jefe y en las entradas de caja.`);
  }

  protected estadoDeCuenta(): void {
    const d = this.detalle();
    if (!d) return;
    const compras = this.inventario.entradas().filter((e) => e.proveedor === d.p.nombre);
    const pagos = this.servicio.pagos().filter((x) => x.proveedor === d.p.nombre).reverse();
    exportarCsv(`estado-de-cuenta-${d.p.nombre.toLowerCase().replace(/\s+/g, '-')}`, [
      [`Estado de cuenta · ${d.p.nombre}`],
      ['RFC', d.p.rfc, 'Condición', CONDICIONES[d.p.condicion].texto],
      [],
      ['Fecha', 'Movimiento', 'Documento', 'Cargo', 'Abono'],
      ...compras.map((e) => [new Date(e.fecha).toLocaleDateString('es-MX'), `Compra (${FORMAS_PAGO[e.pago].corto})`, e.documento, e.total, e.pago === 'credito' ? 0 : e.total]),
      ...pagos.map((x) => [new Date(x.fecha).toLocaleDateString('es-MX'), `Pago ${x.origen === 'caja' ? 'de caja' : 'por transferencia'} ${x.referencia}`.trim(), x.documento, 0, x.monto]),
      [],
      ['Saldo por pagar', '', '', this.servicio.deudaDe(d.p.nombre)],
    ]);
  }
}
