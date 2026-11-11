import { Component, computed, inject, input } from '@angular/core';
import { formatearDinero, formatearFechaCorta, formatearHora } from '../../../compartido/formato';
import { ClientesService } from '../../clientes/clientes.service';
import { Orden } from '../../ordenes/ordenes.service';
import { textoDireccion } from '../../punto-de-venta/clientes.datos';
import { NEGOCIO } from '../documentos.service';
import { REGLAS_TALLER } from '../../../compartido/reglas-taller';

/** C11 · Orden de servicio en hoja carta, con cláusulas y firmas. */
@Component({
  selector: 'app-orden-carta',
  standalone: true,
  templateUrl: './orden-carta.component.html',
  styleUrl: './orden-carta.component.css',
})
export class OrdenCartaComponent {
  private readonly clientes = inject(ClientesService);
  readonly orden = input.required<Orden>();
  protected readonly negocio = NEGOCIO;

  protected readonly cajera = computed(() => this.orden().ficha?.recibio ?? this.orden().historial[0]?.texto.replace(/^Recibido por /, '') ?? '');
  protected readonly fecha = computed(() => {
    const f = new Date(this.orden().recibido);
    return `${formatearFechaCorta(f)} · ${formatearHora(f)}`;
  });
  protected readonly direccion = computed(() => {
    const o = this.orden();
    const c = this.clientes.clientes().find((x) => x.telefono === o.cliente.telefono || x.nombre === o.cliente.nombre);
    return textoDireccion(c?.direccion) || '—';
  });
  /** Tipo, marca y modelo: de la recepción o, en órdenes viejas, del nombre del equipo. */
  protected readonly equipo = computed(() => {
    const o = this.orden();
    const [marca, ...modelo] = o.equipo.split(' ');
    return o.ficha ?? { tipo: 'Teléfono celular', marca, modelo: modelo.join(' '), color: '—', condicion: '' };
  });
  protected readonly metodo = computed(() => {
    const m = this.orden().metodoAnticipo;
    return m ? m.charAt(0).toUpperCase() + m.slice(1) : '—';
  });
  protected readonly clausulas = computed(() => [
    `El anticipo de ${formatearDinero(this.orden().anticipo, true)} cubre la revisión y el diagnóstico; no es reembolsable y se descuenta del total si autorizas la reparación.`,
    'Ninguna reparación se realiza sin tu autorización en el portal. Si el costo cambia, se te pedirá autorizar de nuevo.',
    'Si rechazas el presupuesto, el equipo se devuelve sin reparar y en las condiciones registradas en esta orden.',
    `Tienes ${REGLAS_TALLER.diasSinCobro} días naturales desde el aviso de “Listo” para recoger tu equipo; después se cobra almacenaje de ${formatearDinero(REGLAS_TALLER.almacenajeDia)} por día y el taller no se hace responsable por su deterioro.`,
    `La garantía es de ${REGLAS_TALLER.garantiaDias} días a partir de ${REGLAS_TALLER.garantiaDesde === 'entrega' ? 'la entrega' : 'la reparación'}, solo sobre la falla y piezas reparadas, y se solicita con este mismo folio.`,
    'La garantía no cubre golpes, humedad, sellos rotos, manipulación de terceros ni daños posteriores a la entrega.',
    'Respalda tu información; el taller no responde por pérdida de datos ni por accesorios no registrados en esta orden.',
  ]);

  protected dinero(importe: number): string {
    return formatearDinero(importe);
  }
}
