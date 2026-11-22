import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMISOR_FISCAL } from '../../administrador/configuracion.service';
import { descargarPdf, descargarXml } from '../../administrador/facturacion/archivos-cfdi';
import { Cfdi, FacturacionService, serieFolio } from '../../administrador/facturacion.service';
import { ClientesService } from '../../cajera/clientes/clientes.service';
import { OrdenesService } from '../../cajera/ordenes/ordenes.service';
import { REGIMENES_FISCALES, USOS_CFDI } from '../../cajera/punto-de-venta/clientes.datos';
import { HistorialVentasService } from '../../cajera/ventas/historial-ventas.service';
import { formatearDinero } from '../../compartido/formato';
import { InformacionModalComponent } from '../compartido/informacion-modal.component';
import { PortalService } from '../portal.service';

const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

/** Folio como lo escribe el cliente → "V-00862" o "#1024". */
function normalizar(t: string): string {
  const s = t.trim().toUpperCase().replace(/\s/g, '');
  const venta = s.match(/^V-?(\d{1,5})$/);
  if (venta) return `V-${venta[1].padStart(5, '0')}`;
  const orden = s.match(/^#?(\d{3,4})$/);
  return orden ? `#${orden[1].padStart(4, '0')}` : s;
}

/** P4.2 · Solicita tu factura (autofactura con folio y total del ticket). */
@Component({
  selector: 'app-factura-portal',
  standalone: true,
  imports: [RouterLink, InformacionModalComponent],
  templateUrl: './factura-portal.component.html',
  styleUrls: ['../portal.css', './factura-portal.component.css'],
})
export class FacturaPortalComponent {
  private readonly portal = inject(PortalService);
  private readonly ventas = inject(HistorialVentasService);
  private readonly ordenes = inject(OrdenesService);
  private readonly facturacion = inject(FacturacionService);
  private readonly clientes = inject(ClientesService);

  protected readonly regimenes = REGIMENES_FISCALES;
  protected readonly usos = USOS_CFDI;
  protected readonly disponible = EMISOR_FISCAL.autofactura;
  protected readonly volver = this.portal.sesion() ? '/portal/mis-equipos' : '/portal';
  protected readonly privacidad = signal(false);

  private readonly cliente = this.portal.cliente();
  private readonly fiscal = this.cliente?.fiscal;
  private readonly inicial = inject(ActivatedRoute).snapshot.queryParamMap.get('folio') ?? '';

  protected readonly folio = signal(this.inicial ? normalizar(this.inicial) : '');
  protected readonly total = signal<string>('');
  protected readonly rfc = signal(this.fiscal?.rfc ?? '');
  protected readonly razon = signal(this.fiscal?.razonSocial ?? '');
  protected readonly cp = signal(this.fiscal?.codigoPostal ?? '');
  protected readonly regimen = signal(this.fiscal?.regimen ?? '');
  protected readonly uso = signal(this.fiscal?.usoCfdi ?? '');
  protected readonly acepto = signal(false);
  protected readonly intentado = signal(false);
  protected readonly emitida = signal<Cfdi | null>(null);

  constructor() {
    // Si el folio es de un equipo del cliente con sesión, el total ya se conoce (Figma P4.2).
    const o = this.inicial ? this.portal.ordenDe(this.inicial) : undefined;
    if (o?.entrega) this.total.set(o.entrega.pagado.toFixed(2));
  }

  /** La compra que corresponde al folio, o por qué no se puede facturar. */
  protected readonly compra = computed(() => {
    const folio = normalizar(this.folio());
    if (!folio) return null;
    let origen = '';
    let total = 0;
    let fecha = '';
    if (folio.startsWith('V-')) {
      const v = this.ventas.ventas().find((x) => x.folio === folio);
      if (!v) return { error: 'No encontramos ese folio. Revisa tu ticket.' };
      if (v.estado === 'cancelada' || v.estado === 'devuelta') return { error: 'Esa venta se canceló o se devolvió; no se puede facturar.' };
      [origen, total, fecha] = [`Venta ${v.folio}`, v.total, v.fecha];
    } else {
      const o = this.ordenes.ordenes().find((x) => x.folio === folio);
      if (!o) return { error: 'No encontramos ese folio. Revisa tu ticket u orden.' };
      if (!o.entrega) return { error: 'Esa orden todavía no se entrega. Podrás facturarla al pagarla.' };
      [origen, total, fecha] = [`Orden ${o.folio}`, o.entrega.pagado, o.entrega.fecha];
    }
    const ya = this.facturacion.facturas().find((f) => f.origen === origen && f.estado === 'timbrada');
    if (ya) return { error: `Ese folio ya tiene la factura ${serieFolio(ya)}.`, factura: ya };
    const f = new Date(fecha);
    const hoy = new Date();
    if (f.getMonth() !== hoy.getMonth() || f.getFullYear() !== hoy.getFullYear()) return { error: 'Solo se puede facturar dentro del mismo mes de la compra. Para meses anteriores, pide ayuda en el taller.' };
    return { origen, total };
  });

  protected readonly errores = computed(() => {
    const e: Record<string, string> = {};
    const c = this.compra();
    if (!this.folio().trim()) e['folio'] = 'Escribe el folio de tu ticket u orden.';
    else if (c && 'error' in c) e['folio'] = c.error!;
    const total = Number(this.total().replace(/[$,\s]/g, ''));
    if (!(total > 0)) e['total'] = 'Escribe el total que pagaste.';
    else if (c && 'total' in c && Math.abs(total - c.total!) > 0.5) e['total'] = 'El total no coincide con el de tu ticket.';
    const rfc = this.rfc().trim().toUpperCase();
    if (!RFC.test(rfc)) e['rfc'] = 'El RFC tiene 12 caracteres (empresa) o 13 (persona).';
    else if (rfc === 'XAXX010101000' || rfc === 'XEXX010101000') e['rfc'] = 'Ese RFC es de público en general; escribe el tuyo (esas ventas van en la factura global).';
    if (!this.razon().trim()) e['razon'] = 'Escríbelo tal como aparece en tu constancia fiscal.';
    if (!/^\d{5}$/.test(this.cp())) e['cp'] = 'El C.P. tiene 5 dígitos.';
    if (!this.regimen()) e['regimen'] = 'Elige tu régimen.';
    if (!this.uso()) e['uso'] = 'Elige el uso del CFDI.';
    if (!this.acepto()) e['acepto'] = 'Para facturar necesitamos que aceptes el aviso de privacidad.';
    return e;
  });

  protected readonly yaFacturada = computed(() => {
    const c = this.compra();
    return c && 'factura' in c ? (c.factura ?? null) : null;
  });

  protected generar(): void {
    this.intentado.set(true);
    const c = this.compra();
    if (!this.disponible || Object.keys(this.errores()).length || !c || !('total' in c)) return;
    const rfc = this.rfc().trim().toUpperCase();
    const razon = this.razon().trim().toUpperCase();
    const id = this.facturacion.timbrar({ cliente: razon, rfc, origen: c.origen!, total: c.total!, pidio: 'Autofactura' });
    this.emitida.set(this.facturacion.facturas().find((f) => serieFolio(f) === id) ?? null);
    // Se guardan para la próxima factura (como en C2.18).
    if (this.cliente) this.clientes.guardar({ ...this.cliente, fiscal: { rfc, razonSocial: razon, codigoPostal: this.cp(), regimen: this.regimen(), usoCfdi: this.uso(), correo: this.cliente.correo ?? '' } });
  }

  protected dinero(n: number): string {
    return formatearDinero(n);
  }

  protected pdf(f: Cfdi): void {
    descargarPdf(f);
  }

  protected xml(f: Cfdi): void {
    descargarXml(f);
  }
}
