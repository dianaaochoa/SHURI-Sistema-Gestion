import { Component, computed, inject, input } from '@angular/core';
import { formatearDinero, formatearFechaCorta, formatearHora } from '../../../compartido/formato';
import { ClientesService } from '../../clientes/clientes.service';
import { Orden } from '../../ordenes/ordenes.service';
import { textoDireccion } from '../../punto-de-venta/clientes.datos';
import { NEGOCIO } from '../documentos.service';
import { CLAUSULAS_RECEPCION, llenarClausula } from '../../../compartido/ajustes-documentos';
import { QrComponent } from '../../../compartido/qr/qr.component';

/** C11 · Orden de servicio en hoja carta, con cláusulas y firmas. */
@Component({
  selector: 'app-orden-carta',
  standalone: true,
  imports: [QrComponent],
  templateUrl: './orden-carta.component.html',
  styleUrl: './orden-carta.component.css',
})
export class OrdenCartaComponent {
  /** Liga del portal que abre el QR (P2). */
  protected readonly seguimiento = computed(() => `https://${NEGOCIO.web}/portal/equipo/${this.orden().folio.replace('#', '')}`);
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
  /** Cláusulas de Configuración › Documentos (AD9.3) con los valores del taller (J9). */
  protected readonly clausulas = computed(() => CLAUSULAS_RECEPCION.map((c) => `${c.titulo}. ${llenarClausula(c.texto)}`));

  protected dinero(importe: number): string {
    return formatearDinero(importe);
  }
}
