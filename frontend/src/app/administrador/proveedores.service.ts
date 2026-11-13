import { Injectable, computed, inject, signal } from '@angular/core';
import { CajaService } from '../cajera/caja.service';
import { Entrada, PROVEEDORES, redondear } from '../cajera/inventario/inventario.datos';
import { InventarioService } from '../cajera/inventario/inventario.service';

export type Condicion = 'contado' | 'credito-15' | 'credito-30';

export const CONDICIONES: Record<Condicion, { texto: string; dias: number }> = {
  contado: { texto: 'Contado', dias: 0 },
  'credito-15': { texto: 'Crédito 15 días', dias: 15 },
  'credito-30': { texto: 'Crédito 30 días', dias: 30 },
};

export interface Proveedor {
  nombre: string;
  rfc: string;
  contacto: string;
  telefono: string;
  correo: string;
  condicion: Condicion;
  /** Límite de crédito (0 = sin crédito). */
  limite: number;
  surte: string;
}

export type OrigenPago = 'transferencia' | 'caja';

export interface PagoRegistrado {
  fecha: string;
  proveedor: string;
  documento: string;
  monto: number;
  origen: OrigenPago;
  referencia: string;
  por: string;
}

/** Factura a crédito con lo pagado, el saldo y cuándo vence (AD5). */
export interface Factura {
  entrada: Entrada;
  pagado: number;
  saldo: number;
  vence: Date;
}

const DIA = 86_400_000;

/** Los tres proveedores que aparecen en Inventario (Figma AD5.1). */
const PROVEEDORES_DEMO: Proveedor[] = [
  { nombre: 'Distribuidora MovilTec', rfc: 'DMO190311AB2', contacto: 'Óscar Lara', telefono: '55 2020 3344', correo: 'ventas@moviltec.mx', condicion: 'credito-15', limite: 20000, surte: 'Accesorios y pantallas' },
  { nombre: 'Refacciones Móviles del Centro', rfc: 'RMC150822KL4', contacto: '', telefono: '', correo: 'pedidos@rmcentro.mx', condicion: 'contado', limite: 0, surte: 'Refacciones y consumibles' },
  { nombre: 'Importadora Celular GDL', rfc: 'ICG170605TR8', contacto: 'Marisol Ríos', telefono: '33 3615 2200', correo: 'pedidos@importadoragdl.mx', condicion: 'contado', limite: 0, surte: 'Fundas y cargadores' },
];

/**
 * AD5 · Proveedores, sus condiciones de pago y lo que se les debe.
 * Las compras son las entradas de mercancía de caja (C7.3); simulado en memoria mientras no exista la API.
 */
@Injectable({ providedIn: 'root' })
export class ProveedoresService {
  private readonly inventario = inject(InventarioService);
  private readonly caja = inject(CajaService);

  readonly proveedores = signal<Proveedor[]>(PROVEEDORES_DEMO);
  readonly pagos = signal<PagoRegistrado[]>([]);

  buscar(nombre: string): Proveedor | undefined {
    return this.proveedores().find((p) => p.nombre === nombre);
  }

  /** Días de crédito del proveedor (si no está dado de alta o es de contado, 30 días por omisión). */
  private dias(nombre: string): number {
    return CONDICIONES[this.buscar(nombre)?.condicion ?? 'credito-30'].dias || 30;
  }

  pagadoDe(documento: string): number {
    return redondear(this.pagos().filter((p) => p.documento === documento).reduce((s, p) => s + p.monto, 0));
  }

  /** Facturas a crédito con saldo, de la que vence primero a la última. */
  readonly porPagar = computed<Factura[]>(() =>
    this.inventario
      .entradas()
      .filter((e) => e.pago === 'credito')
      .map((e) => {
        const pagado = this.pagadoDe(e.documento);
        return { entrada: e, pagado, saldo: redondear(e.total - pagado), vence: new Date(new Date(e.fecha).getTime() + this.dias(e.proveedor) * DIA) };
      })
      .filter((f) => f.saldo > 0.005)
      .sort((a, b) => a.vence.getTime() - b.vence.getTime()),
  );

  deudaDe(nombre: string): number {
    return redondear(this.porPagar().filter((f) => f.entrada.proveedor === nombre).reduce((s, f) => s + f.saldo, 0));
  }

  /** AD5.3 · Alta de proveedor (aparece en los pedidos del jefe y en las entradas de caja). */
  registrar(p: Proveedor): void {
    this.proveedores.update((lista) => [...lista, p]);
    // Las pantallas de caja y del jefe leen la lista de nombres de Inventario (en memoria hasta que exista la API).
    if (!PROVEEDORES.includes(p.nombre)) PROVEEDORES.push(p.nombre);
  }

  /** AD5.2 · Pago a una factura; si sale de caja, entra al corte como "Pago a proveedor" (C10). */
  pagar(pago: Omit<PagoRegistrado, 'fecha'> & { fecha?: string }): void {
    const registro: PagoRegistrado = { ...pago, fecha: pago.fecha ?? new Date().toISOString(), monto: redondear(pago.monto) };
    this.pagos.update((lista) => [registro, ...lista]);
    if (pago.origen === 'caja') this.caja.pagarProveedor({ proveedor: pago.proveedor, documento: pago.documento, pedido: null, monto: registro.monto });
  }
}
