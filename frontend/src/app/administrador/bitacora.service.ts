import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../acceso/auth.service';
import { CajaService } from '../cajera/caja.service';
import { CorteService } from '../cajera/corte/corte.service';
import { TIPOS_AJUSTE } from '../cajera/inventario/inventario.datos';
import { InventarioService } from '../cajera/inventario/inventario.service';
import { HistorialVentasService } from '../cajera/ventas/historial-ventas.service';
import { formatearDinero } from '../compartido/formato';
import { FacturacionService, MOTIVOS_CANCELACION, serieFolio } from './facturacion.service';
import { ProveedoresService } from './proveedores.service';

export type TipoAccion =
  | 'descuento'
  | 'almacenaje'
  | 'retiro'
  | 'ingreso'
  | 'pedido'
  | 'temporal'
  | 'ajuste'
  | 'garantia'
  | 'precio'
  | 'cancelacion'
  | 'pago'
  | 'corte'
  | 'usuario'
  | 'permisos';

/** Cómo se ve cada acción (Figma AD8.1). */
export const ACCIONES: Record<TipoAccion, { texto: string; tono: string }> = {
  descuento: { texto: 'Descuento', tono: 'advertencia' },
  almacenaje: { texto: 'Perdonó almacenaje', tono: 'advertencia' },
  retiro: { texto: 'Retiro de caja', tono: 'neutro' },
  ingreso: { texto: 'Ingreso a caja', tono: 'neutro' },
  pedido: { texto: 'Pedido a proveedor', tono: 'neutro' },
  temporal: { texto: 'Contraseña temporal', tono: 'advertencia' },
  ajuste: { texto: 'Ajuste de inventario', tono: 'peligro' },
  garantia: { texto: 'Dictamen de garantía', tono: 'neutro' },
  precio: { texto: 'Cambio de precio', tono: 'info' },
  cancelacion: { texto: 'Cancelación de factura', tono: 'peligro' },
  pago: { texto: 'Pago a proveedor', tono: 'neutro' },
  corte: { texto: 'Revisión de corte', tono: 'info' },
  usuario: { texto: 'Cambio de usuario', tono: 'info' },
  permisos: { texto: 'Permisos por rol', tono: 'advertencia' },
};

export interface RegistroBitacora {
  id: string;
  /** ISO */
  fecha: string;
  /** Nombre de quien lo hizo (o "Caja 01" si no se sabe). */
  nombre: string;
  tipo: TipoAccion;
  /** Texto de la etiqueta cuando lleva dato ("Descuento 10%"). */
  etiqueta?: string;
  detalle: string;
  modulo: string;
  /** Pantalla donde se ve el movimiento. */
  ruta?: string;
}

const MIN = 60_000;
const DECISION: Record<string, string> = { descontar: 'se descuenta a la cajera', absorber: 'lo absorbe el negocio', investigar: 'en investigación' };
const DIA = 86_400_000;

/** Las 8 acciones de Figma AD8.1 (con la misma distancia entre ellas, contando desde hace 10 minutos). */
function demoHoy(): RegistroBitacora[] {
  const base = Date.now() - 10 * MIN;
  const en = (minutos: number) => new Date(base - minutos * MIN).toISOString();
  return [
    { id: 'd1', fecha: en(0), nombre: 'Ana Martínez', tipo: 'descuento', etiqueta: 'Descuento 10%', detalle: 'V-00862 · $899.00 · motivo: cliente frecuente', modulo: 'Punto de venta', ruta: '/administrador/ventas-y-utilidad' },
    { id: 'd2', fecha: en(22), nombre: 'Jorge López', tipo: 'almacenaje', detalle: '#0961 · $120.00 · “cliente avisó viaje”', modulo: 'Taller', ruta: '/administrador/taller' },
    { id: 'd3', fecha: en(72), nombre: 'Ana Martínez', tipo: 'retiro', detalle: '$500.00 · envío a gerencia · firmado', modulo: 'Corte', ruta: '/administrador/cortes-de-caja' },
    { id: 'd4', fecha: en(157), nombre: 'Jorge López', tipo: 'pedido', detalle: 'PED-0124 · $360.00 · Refacciones Móviles del Centro', modulo: 'Refacciones', ruta: '/administrador/proveedores' },
    { id: 'd5', fecha: en(181), nombre: 'Verónica Castillo', tipo: 'temporal', detalle: 'Asignada a amartinez · pidió restablecer su contraseña', modulo: 'Usuarios', ruta: '/administrador/usuarios-y-permisos' },
    { id: 'd6', fecha: en(182), nombre: 'Ana Martínez', tipo: 'ajuste', detalle: 'REF-IP13-LCD −1 · merma: pantalla dañada al probar', modulo: 'Inventario', ruta: '/administrador/catalogo-y-precios' },
    { id: 'd7', fecha: en(267), nombre: 'Jorge López', tipo: 'garantia', detalle: '#0987 · aplica sin costo', modulo: 'Garantías', ruta: '/administrador/taller' },
    { id: 'd8', fecha: en(302), nombre: 'Verónica Castillo', tipo: 'precio', detalle: 'ACC-020 Cargador USB-C 20W $240 → $250', modulo: 'Catálogo', ruta: '/administrador/catalogo-y-precios' },
  ];
}

/** Historial de prueba de los últimos 30 días (acciones parecidas, de distintas personas). */
function demoHistorial(): RegistroBitacora[] {
  const plantillas: Omit<RegistroBitacora, 'id' | 'fecha'>[] = [
    { nombre: 'Ana Martínez', tipo: 'descuento', etiqueta: 'Descuento 5%', detalle: 'V-00840 · $450.00 · motivo: cliente frecuente', modulo: 'Punto de venta' },
    { nombre: 'Jorge López', tipo: 'garantia', detalle: '#0912-G · no aplica (humedad posterior)', modulo: 'Garantías' },
    { nombre: 'Luis Peña', tipo: 'retiro', detalle: '$1,000.00 · envío a gerencia · firmado', modulo: 'Corte' },
    { nombre: 'Jorge López', tipo: 'pedido', detalle: 'PED-0119 · $1,240.00 · Distribuidora MovilTec', modulo: 'Refacciones' },
    { nombre: 'Verónica Castillo', tipo: 'precio', detalle: 'ACC-001 Mica cristal templado $90 → $100', modulo: 'Catálogo' },
    { nombre: 'Luis Peña', tipo: 'descuento', etiqueta: 'Descuento 10%', detalle: 'V-00831 · $1,250.00 · motivo: compra de mayoreo', modulo: 'Punto de venta' },
    { nombre: 'Jorge López', tipo: 'almacenaje', detalle: '#0898 · $60.00 · “cliente hospitalizado”', modulo: 'Taller' },
    { nombre: 'Ana Martínez', tipo: 'ajuste', detalle: 'ACC-046 −1 · conteo físico: faltó 1 pieza', modulo: 'Inventario' },
    { nombre: 'Verónica Castillo', tipo: 'temporal', detalle: 'Asignada a lortega · alta de usuario', modulo: 'Usuarios' },
    { nombre: 'Jorge López', tipo: 'garantia', detalle: '#0875-G · aplica sin costo', modulo: 'Garantías' },
  ];
  const lista: RegistroBitacora[] = [];
  for (let i = 0; i < 36; i++) {
    const p = plantillas[(i * 7) % plantillas.length];
    const dia = 1 + Math.floor(i * 0.8);
    const minutos = ((i * 137) % 540) + 9 * 60;
    const f = new Date(Date.now() - dia * DIA);
    f.setHours(0, minutos, 0, 0);
    lista.push({ ...p, id: `h${i}`, fecha: f.toISOString() });
  }
  return lista;
}

/**
 * AD8 · Bitácora de acciones sensibles. No se edita ni se borra: solo se agregan registros.
 * Junta lo que ya guardan los módulos (precios, ajustes, pedidos, pagos, facturas, cortes, caja, descuentos)
 * con lo que se registra aquí (usuarios y permisos) y un historial de prueba.
 */
@Injectable({ providedIn: 'root' })
export class BitacoraService {
  private readonly auth = inject(AuthService);
  private readonly inventario = inject(InventarioService);
  private readonly proveedores = inject(ProveedoresService);
  private readonly facturacion = inject(FacturacionService);
  private readonly cortes = inject(CorteService);
  private readonly caja = inject(CajaService);
  private readonly ventas = inject(HistorialVentasService);

  private readonly propios = signal<RegistroBitacora[]>([...demoHoy(), ...demoHistorial()]);
  private consecutivo = 0;

  /** Agrega una acción con la persona de la sesión (solo agrega; nunca edita ni borra). */
  registrar(tipo: TipoAccion, detalle: string, modulo: string, ruta?: string): void {
    const nombre = this.auth.sesion()?.nombre ?? 'Sistema';
    this.propios.update((lista) => [{ id: `r${++this.consecutivo}`, fecha: new Date().toISOString(), nombre, tipo, detalle, modulo, ruta }, ...lista]);
  }

  /** Todas las acciones, de la más reciente a la más antigua. */
  readonly registros = computed<RegistroBitacora[]>(() => {
    const lista: RegistroBitacora[] = [...this.propios()];
    const de = (id: string, r: Omit<RegistroBitacora, 'id'>) => lista.push({ id, ...r });

    for (const c of this.inventario.cambiosPrecio())
      de(`precio-${c.sku}-${c.fecha}`, { fecha: c.fecha, nombre: c.por, tipo: 'precio', detalle: `${c.sku} ${c.nombre} ${formatearDinero(c.antes, true)} → ${formatearDinero(c.despues, true)}${c.motivo ? ` · ${c.motivo}` : ''}`, modulo: 'Catálogo', ruta: '/administrador/catalogo-y-precios' });
    for (const a of this.inventario.ajustes())
      de(`ajuste-${a.folio}`, { fecha: a.fecha, nombre: a.hizo, tipo: 'ajuste', detalle: `${a.sku} ${a.diferencia > 0 ? '+' : '−'}${Math.abs(a.diferencia)} · ${TIPOS_AJUSTE[a.tipo].texto.toLowerCase()}: ${a.motivo}`, modulo: 'Inventario', ruta: '/administrador/catalogo-y-precios' });
    for (const p of this.inventario.pedidos().filter((x) => x.creado))
      de(`pedido-${p.folio}`, { fecha: p.creado!, nombre: p.jefe, tipo: 'pedido', detalle: `${p.folio} · ${formatearDinero(p.lineas.reduce((s, l) => s + l.costo * l.cantidad, 0))} · ${p.proveedor}`, modulo: 'Refacciones', ruta: '/administrador/proveedores' });
    for (const p of this.proveedores.pagos())
      de(`pago-${p.documento}-${p.fecha}`, { fecha: p.fecha, nombre: p.por, tipo: 'pago', detalle: `${p.documento} · ${formatearDinero(p.monto)} · ${p.proveedor} · ${p.origen === 'caja' ? 'efectivo de caja' : 'transferencia'}${p.referencia ? ` ${p.referencia}` : ''}`, modulo: 'Proveedores', ruta: '/administrador/proveedores' });
    for (const f of this.facturacion.facturas().filter((x) => x.cancelacion))
      de(`cfdi-${serieFolio(f)}`, { fecha: f.cancelacion!.fecha, nombre: f.cancelacion!.por, tipo: 'cancelacion', detalle: `${serieFolio(f)} · ${formatearDinero(f.total)} · motivo ${MOTIVOS_CANCELACION[f.cancelacion!.motivo].texto}${f.cancelacion!.sustituta ? ` · la sustituye ${f.cancelacion!.sustituta}` : ''}`, modulo: 'Facturación', ruta: '/administrador/facturacion' });
    for (const c of this.cortes.cortes().filter((x) => x.revision))
      de(`corte-${c.folio}`, { fecha: c.revision!.fecha, nombre: c.revision!.por, tipo: 'corte', detalle: `${c.folio} · ${c.cajera} · diferencia ${formatearDinero(c.contado - c.esperado)} · ${DECISION[c.revision!.decision]}${c.revision!.nota ? ` · ${c.revision!.nota}` : ''}`, modulo: 'Cortes de caja', ruta: '/administrador/cortes-de-caja' });
    for (const m of this.caja.movimientos())
      de(`caja-${m.folio}`, { fecha: m.fecha, nombre: 'Caja 01', tipo: m.tipo, detalle: `${m.folio} · ${formatearDinero(m.monto)} · ${m.motivo}${m.comentario ? ` · ${m.comentario}` : ''}`, modulo: 'Corte', ruta: '/administrador/cortes-de-caja' });
    for (const v of this.ventas.ventas().filter((x) => x.descuento))
      de(`desc-${v.folio}`, { fecha: v.fecha, nombre: v.cajera, tipo: 'descuento', etiqueta: v.descuento!.modo === '%' ? `Descuento ${v.descuento!.valor}%` : `Descuento ${formatearDinero(v.descuento!.valor, true)}`, detalle: `${v.folio} · ${formatearDinero(v.total)} · motivo: ${v.descuento!.motivo.toLowerCase()}`, modulo: 'Punto de venta', ruta: '/administrador/ventas-y-utilidad' });

    return lista.sort((a, b) => b.fecha.localeCompare(a.fecha));
  });
}
