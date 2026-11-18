import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { formatearDinero } from '../../compartido/formato';
import { cuando, diaMes } from '../ordenes/detalle-orden/detalle-orden.component';
import { diasGarantia, diasParaRecoger, ENTREGABLES, ESTADOS_ORDEN, Orden, OrdenesService, saldo, sumarDias } from '../ordenes/ordenes.service';
import { CLIENTES, Cliente, DatosFiscales } from '../punto-de-venta/clientes.datos';
import { DatosFacturaComponent } from '../punto-de-venta/datos-factura/datos-factura.component';
import { DispositivosService } from '../punto-de-venta/dispositivos.service';
import { MetodoSimple } from '../punto-de-venta/venta.service';
import { CobroEntregaComponent, TipoEntrega } from './cobro-entrega/cobro-entrega.component';
import { QuienRecogeComponent, Recoge } from './quien-recoge/quien-recoge.component';
import { DocumentosService } from '../documentos/documentos.service';
import { FacturacionService } from '../../administrador/facturacion.service';

const METODO_TEXTO: Record<MetodoSimple, string> = { efectivo: 'en efectivo', tarjeta: 'con tarjeta', transferencia: 'por transferencia' };

/** C6 · Entrega de equipo: C6.1 normal · C6.2 sin reparar · C6.3 regreso de garantía · C6.4 recoge otra persona. */
@Component({
  selector: 'app-entrega',
  standalone: true,
  imports: [RouterLink, QuienRecogeComponent, CobroEntregaComponent, DatosFacturaComponent],
  templateUrl: './entrega.component.html',
  styleUrl: './entrega.component.css',
})
export class EntregaComponent {
  private readonly ordenes = inject(OrdenesService);
  private readonly dispositivos = inject(DispositivosService);
  private readonly documentos = inject(DocumentosService);
  private readonly facturacion = inject(FacturacionService);
  private readonly cajera = inject(AuthService).sesion()?.nombre ?? '';
  private readonly buscador = viewChild<ElementRef<HTMLInputElement>>('buscador');

  protected readonly estados = ESTADOS_ORDEN;
  protected readonly dinero = formatearDinero;
  protected readonly cuando = cuando;
  protected readonly diaMes = diaMes;

  /** Tarjetas de arriba: lo que se puede entregar hoy. */
  protected readonly porEntregar = computed(() =>
    this.ordenes
      .ordenes()
      .filter((o) => ENTREGABLES.includes(o.estado))
      .sort((a, b) => ENTREGABLES.indexOf(a.estado) - ENTREGABLES.indexOf(b.estado)),
  );

  protected readonly busqueda = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  private readonly folio = signal<string | null>(null);

  protected readonly orden = computed<Orden | null>(() => {
    const lista = this.porEntregar();
    return lista.find((o) => o.folio === this.folio()) ?? lista[0] ?? null;
  });

  protected readonly tipo = computed<TipoEntrega>(() => {
    const estado = this.orden()?.estado;
    return estado === 'sin-reparacion' ? 'sin-reparar' : estado === 'garantia-lista' ? 'garantia' : 'normal';
  });

  constructor() {
    // C4 "Entregar equipo" llega con ?folio=1026.
    const folio = inject(ActivatedRoute).snapshot.queryParamMap.get('folio');
    if (folio) this.buscarFolio(folio);
  }

  // ---------- Búsqueda ----------
  buscarFolio(texto = this.busqueda()): void {
    const numero = texto.replace(/[^0-9]/g, '');
    if (!numero) return;
    const folio = `#${numero.padStart(4, '0')}`;
    this.busqueda.set(folio);
    this.aviso.set(null);
    const orden = this.ordenes.ordenes().find((o) => o.folio === folio);
    if (!orden) {
      this.error.set(`No existe el folio ${folio}. Revisa el número del ticket o búscalo en Órdenes de servicio.`);
    } else if (!ENTREGABLES.includes(orden.estado)) {
      this.error.set(`El folio ${folio} (${orden.equipo}) todavía no se puede entregar: está “${ESTADOS_ORDEN[orden.estado].texto}”.`);
    } else {
      this.error.set(null);
      this.elegir(orden);
    }
  }

  escanear(): void {
    // El lector de códigos escribe el folio como teclado: basta con enfocar el campo.
    this.busqueda.set('');
    this.buscador()?.nativeElement.focus();
  }

  elegir(orden: Orden): void {
    this.folio.set(orden.folio);
    this.verificacion.set({});
    this.factura.set(null);
    this.metodo.set('efectivo');
  }

  // ---------- Datos de la orden ----------
  protected readonly datos = computed(() => {
    const o = this.orden();
    if (!o) return [];
    const accesorios = { etiqueta: 'Accesorios registrados', valor: o.accesorios ?? 'Ninguno' };
    const limite = o.listaDesde ? `${diaMes(sumarDias(o.listaDesde, diasParaRecoger()))} (${diasParaRecoger()} días)` : '—';
    switch (o.estado) {
      case 'garantia-lista':
        return [
          { etiqueta: 'Entrega original', valor: diaMes(o.entrega!.fecha) },
          { etiqueta: 'Garantía recibida', valor: diaMes(o.garantia!.recibida) },
          { etiqueta: 'Dictamen', valor: o.garantia!.dictamen },
          accesorios,
        ];
      case 'sin-reparacion':
        return [
          { etiqueta: 'Recibido', valor: cuando(o.recibido) },
          { etiqueta: o.rechazo ? 'Rechazó' : 'Diagnóstico', valor: `${cuando(o.rechazo ?? o.listaDesde!)}${o.rechazo ? ' (portal)' : ''}` },
          { etiqueta: 'Recoger antes del', valor: limite },
          accesorios,
        ];
      case 'bodega':
        return [
          { etiqueta: 'Recibido', valor: cuando(o.recibido) },
          { etiqueta: 'En bodega desde', valor: diaMes(o.bodega!.enviado) },
          { etiqueta: 'Ubicación', valor: `${o.bodega!.ubicacion} · ${o.bodega!.estante}` },
          accesorios,
        ];
      default:
        return [
          { etiqueta: 'Recibido', valor: cuando(o.recibido) },
          { etiqueta: 'Terminado', valor: cuando(o.listaDesde!) },
          { etiqueta: 'Recoger antes del', valor: limite },
          accesorios,
        ];
    }
  });

  protected readonly descripcion = computed(() => {
    const o = this.orden();
    if (!o) return '';
    if (o.estado === 'garantia-lista') return `Falla reportada: ${o.garantia!.falla}. ${o.garantia!.resolucion}`;
    if (o.estado === 'sin-reparacion') return o.realizado ?? 'El equipo se devuelve sin reparar y en las mismas condiciones registradas en la orden.';
    return `Trabajo realizado: ${o.realizado ?? o.trabajo}`;
  });

  protected readonly estadoTexto = computed(() => {
    const o = this.orden();
    if (!o) return { texto: '', tono: '' };
    if (o.estado === 'lista') return { texto: 'Listo para entregar', tono: 'exito' };
    if (o.estado === 'sin-reparacion') return { texto: o.rechazo ? 'Rechazado · sin reparar' : 'Sin reparación', tono: 'peligro' };
    return { texto: ESTADOS_ORDEN[o.estado].texto, tono: ESTADOS_ORDEN[o.estado].tono };
  });

  // ---------- ¿Quién recoge? y verificación ----------
  protected readonly recoge = signal<Recoge | null>(null);
  protected readonly verificacion = signal<Record<number, boolean>>({});

  protected readonly puntos = computed(() => {
    const o = this.orden();
    if (!o) return [];
    if (this.recoge()?.tipo === 'otra') {
      return [`El folio ${o.folio} coincide con la carta poder`, 'La identificación de quien recoge coincide con la carta poder', 'Quien recoge probó el equipo frente a caja'];
    }
    const base = [`El cliente presenta su folio ${o.estado === 'garantia-lista' ? '' : 'o contrato '}${o.folio}`, 'La identificación oficial coincide con el titular'];
    if (this.tipo() === 'sin-reparar') return [...base, 'El cliente revisa que el equipo está igual que al recibirlo', 'El cliente firma de conformidad la devolución'];
    if (this.tipo() === 'garantia') return [...base, 'El cliente probó el equipo frente a caja', 'Se explica que este folio ya usó su garantía'];
    const accesorios = o.accesorios && o.accesorios !== 'Ninguno' ? [`Se devuelven los accesorios registrados (${o.accesorios.toLowerCase()})`] : [];
    return [...base, 'El cliente probó el equipo', ...accesorios];
  });

  /** Si cambia entre titular y otra persona, la verificación es otra y se vuelve a marcar. */
  protected cambioRecoge(recoge: Recoge): void {
    if (this.recoge()?.tipo !== recoge.tipo) this.verificacion.set({});
    this.recoge.set(recoge);
  }

  /** Total de la factura: lo que se cobra en total por el trabajo (IVA incluido). */
  protected dineroSaldo(orden: Orden): number {
    return orden.presupuesto?.total ?? saldo(orden);
  }

  protected marcar(indice: number, valor: boolean): void {
    this.verificacion.update((v) => ({ ...v, [indice]: valor }));
  }

  /** Lo que falta para entregar (se muestra arriba del botón). */
  protected readonly falta = computed(() => {
    const r = this.recoge();
    if (r?.tipo === 'otra' && !r.completo) return 'Falta el nombre completo de quien recoge, la carta poder y la copia de identificación del titular.';
    const pendientes = this.puntos().filter((_, i) => !this.verificacion()[i]).length;
    return pendientes ? `Marca la verificación antes de entregar (${pendientes} ${pendientes === 1 ? 'punto pendiente' : 'puntos pendientes'}).` : '';
  });

  // ---------- Cobro y entrega ----------
  protected readonly metodo = signal<MetodoSimple>('efectivo');
  protected readonly factura = signal<DatosFiscales | null>(null);
  protected readonly facturaAbierta = signal(false);
  protected readonly clienteFactura = computed<Cliente>(() => {
    const o = this.orden()!;
    return CLIENTES.find((c) => c.telefono === o.cliente.telefono || c.nombre === o.cliente.nombre) ?? { id: o.folio, nombre: o.cliente.nombre, correo: o.cliente.correo };
  });

  alternarFactura(marcada: boolean): void {
    if (marcada) this.facturaAbierta.set(true);
    else this.factura.set(null);
  }

  entregar(): void {
    const o = this.orden();
    if (!o || this.falta()) return;
    // Se lee antes de entregar: después, orden() ya es la siguiente de la lista.
    const tipo = this.tipo();
    const cobrado = saldo(o);
    const totalFactura = this.dineroSaldo(o);
    const recoge = this.recoge();
    const entregada = this.ordenes.entregar(o.folio, { recoge: recoge?.nombre || o.cliente.nombre, pagado: cobrado, metodo: this.metodo(), cajera: this.cajera });
    const impreso = this.documentos.orden(o.folio, 'entrega');
    const partes = [`${o.folio} · ${o.equipo} entregado a ${recoge?.nombre || o.cliente.nombre}`];
    if (cobrado > 0) partes.push(`cobrados ${formatearDinero(cobrado)} ${METODO_TEXTO[this.metodo()]}`);
    const devuelto = -(entregada?.entrega?.cobrado ?? 0);
    if (devuelto > 0) partes.push(`devueltos ${formatearDinero(devuelto)} del anticipo en efectivo`);
    if (tipo === 'normal') partes.push(`garantía hasta el ${diaMes(sumarDias(new Date().toISOString(), diasGarantia()))}`);
    const datos = this.factura();
    if (datos) {
      const folio = this.facturacion.timbrar({ cliente: o.cliente.nombre, rfc: datos.rfc, origen: `Orden ${o.folio}`, total: totalFactura, pidio: 'Caja' });
      partes.push(`factura ${folio} enviada por correo`);
    }
    if (!impreso) partes.push('no se pudo imprimir el comprobante');
    this.aviso.set(partes.join(' · '));
    this.error.set(null);
    this.busqueda.set('');
    this.folio.set(null);
    this.verificacion.set({});
    this.factura.set(null);
  }

  imprimirComprobante(): void {
    const o = this.orden();
    if (!o) return;
    this.aviso.set(this.dispositivos.imprimir(o.folio) ? `Comprobante de ${o.folio} impreso` : 'La impresora no responde: revisa que esté encendida, con papel y conectada');
  }
}
