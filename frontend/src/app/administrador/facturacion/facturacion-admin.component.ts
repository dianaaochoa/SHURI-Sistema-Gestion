import { Component, computed, inject, signal } from '@angular/core';
import { formatearDinero } from '../../compartido/formato';
import { HistorialVentasService } from '../../cajera/ventas/historial-ventas.service';
import { Cfdi, ESTADOS_CFDI, EstadoCfdi, FacturacionService, diaFactura, serieFolio } from '../facturacion.service';
import { dentro, ultimosMeses } from '../reportes';
import { descargarPdf, descargarXml } from './archivos-cfdi';
import { CancelarFacturaComponent } from './cancelar-factura/cancelar-factura.component';
import { DetalleFacturaComponent } from './detalle-factura/detalle-factura.component';
import { FacturaGlobalComponent } from './factura-global/factura-global.component';

type Pestana = 'todas' | EstadoCfdi;

/** AD6.1 · Facturación: CFDI del mes (AD6.2 cancelar, AD6.3 factura global). */
@Component({
  selector: 'app-facturacion-admin',
  standalone: true,
  imports: [DetalleFacturaComponent, CancelarFacturaComponent, FacturaGlobalComponent],
  templateUrl: './facturacion-admin.component.html',
  styleUrls: ['../reportes.css', './facturacion-admin.component.css'],
})
export class FacturacionAdminComponent {
  protected readonly servicio = inject(FacturacionService);
  private readonly historial = inject(HistorialVentasService);

  protected readonly meses = ultimosMeses();
  protected readonly mesId = signal(this.meses[0].id);
  protected readonly mes = computed(() => this.meses.find((m) => m.id === this.mesId()) ?? this.meses[0]);
  protected readonly pestana = signal<Pestana>('todas');
  protected readonly viendo = signal<string | null>(null);
  protected readonly cancelando = signal<string | null>(null);
  protected readonly global = signal(false);
  protected readonly aviso = signal('');

  protected readonly pestanas: { id: Pestana; texto: string }[] = [
    { id: 'todas', texto: 'Todas' },
    { id: 'timbrada', texto: 'Timbradas' },
    { id: 'cancelada', texto: 'Canceladas' },
    { id: 'error', texto: 'Errores' },
  ];

  private readonly delMes = computed(() => this.servicio.facturas().filter((f) => dentro(f.fecha, this.mes())));
  protected readonly conteo = computed(() => {
    const lista = this.delMes();
    return { todas: lista.length, timbrada: lista.filter((f) => f.estado === 'timbrada').length, cancelada: lista.filter((f) => f.estado === 'cancelada').length, error: lista.filter((f) => f.estado === 'error').length };
  });

  protected readonly filas = computed(() =>
    this.delMes()
      .filter((f) => this.pestana() === 'todas' || f.estado === this.pestana())
      .sort((a, b) => b.folio - a.folio)
      .map((f) => ({ f, id: serieFolio(f), dia: diaFactura(f.fecha), estado: ESTADOS_CFDI[f.estado] })),
  );

  protected readonly indicadores = computed(() => {
    const timbradas = this.delMes().filter((f) => f.estado === 'timbrada');
    const canceladas = this.conteo().cancelada;
    const facturadas = new Set(this.servicio.facturas().filter((f) => f.estado === 'timbrada').map((f) => f.origen));
    const porFacturar = this.historial
      .ventas()
      .filter((v) => dentro(v.fecha, this.mes()) && v.cliente.id !== 'publico' && (v.estado === 'pagada' || v.estado === 'devolucion-parcial') && !facturadas.has(`Venta ${v.folio}`)).length;
    const mesCorto = this.mes().texto.split(' ')[0].toLowerCase();
    const timbres = this.servicio.timbres();
    return [
      { valor: formatearDinero(timbradas.reduce((s, f) => s + f.total, 0), true), tono: '', titulo: `Facturado en ${mesCorto}`, detalle: `${timbradas.length} ${timbradas.length === 1 ? 'factura' : 'facturas'}` },
      { valor: `${porFacturar}`, tono: 'primario', titulo: 'Por autofacturar', detalle: 'Tickets del mes con cliente, sin factura' },
      { valor: `${canceladas}`, tono: canceladas ? 'peligro' : '', titulo: canceladas === 1 ? 'Cancelada' : 'Canceladas', detalle: 'Con motivo registrado' },
      { valor: `${timbres}`, tono: timbres > 50 ? 'exito' : 'advertencia', titulo: 'Timbres disponibles', detalle: `Paquete de ${this.servicio.paquete}` },
    ];
  });

  protected readonly vista = computed(() => this.servicio.facturas().find((f) => serieFolio(f) === this.viendo()) ?? null);
  protected readonly porCancelar = computed(() => this.servicio.facturas().find((f) => serieFolio(f) === this.cancelando()) ?? null);

  protected dinero(n: number): string {
    return formatearDinero(n);
  }

  protected cambiarMes(id: string): void {
    this.mesId.set(id);
    this.aviso.set('');
  }

  protected pdf(f: Cfdi): void {
    descargarPdf(f);
  }

  protected xml(f: Cfdi): void {
    descargarXml(f);
  }

  protected pedirCancelacion(id: string): void {
    this.viendo.set(null);
    this.cancelando.set(id);
  }

  protected cancelada(texto: string): void {
    this.cancelando.set(null);
    this.aviso.set(texto);
  }

  protected timbrada(texto: string): void {
    this.global.set(false);
    this.aviso.set(texto);
  }
}
