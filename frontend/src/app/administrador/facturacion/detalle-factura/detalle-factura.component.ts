import { Component, HostListener, computed, input, output } from '@angular/core';
import { formatearDinero } from '../../../compartido/formato';
import { Cfdi, ESTADOS_CFDI, MOTIVOS_CANCELACION, diaFactura, serieFolio } from '../../facturacion.service';
import { descargarPdf, descargarXml } from '../archivos-cfdi';

/** "Ver" de AD6.1: datos de la factura, archivos y cancelación. */
@Component({
  selector: 'app-detalle-factura',
  standalone: true,
  templateUrl: './detalle-factura.component.html',
  styleUrls: ['../../../tecnico/banco/modal-banco.css'],
  styles: ['.datos { display: flex; flex-direction: column; gap: 8px; } .dato strong { word-break: break-all; }'],
})
export class DetalleFacturaComponent {
  readonly factura = input.required<Cfdi>();
  readonly cerrar = output<void>();
  readonly cancelar = output<string>();

  protected readonly id = computed(() => serieFolio(this.factura()));
  protected readonly estado = computed(() => ESTADOS_CFDI[this.factura().estado]);
  protected readonly datos = computed(() => {
    const f = this.factura();
    const hora = new Date(f.fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const filas: [string, string][] = [
      ['Cliente', f.cliente],
      ['RFC', f.rfc],
      ['Origen', f.origen],
      ['Pidió', f.pidio],
      ['Timbrada', `${diaFactura(f.fecha)} · ${hora}`],
      ['Folio fiscal (UUID)', f.uuid],
      ['Subtotal', formatearDinero(f.total / 1.16)],
      ['IVA 16 %', formatearDinero(f.total - f.total / 1.16)],
      ['Total', formatearDinero(f.total)],
    ];
    if (f.sustituye) filas.push(['Sustituye a', f.sustituye]);
    if (f.cancelacion) {
      filas.push(['Motivo de cancelación', MOTIVOS_CANCELACION[f.cancelacion.motivo].texto]);
      filas.push(['Cancelada', `${diaFactura(f.cancelacion.fecha)} · ${f.cancelacion.por}`]);
      if (f.cancelacion.sustituta) filas.push(['La sustituye', f.cancelacion.sustituta]);
    }
    return filas;
  });

  protected pdf(): void {
    descargarPdf(this.factura());
  }

  protected xml(): void {
    descargarXml(this.factura());
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}
