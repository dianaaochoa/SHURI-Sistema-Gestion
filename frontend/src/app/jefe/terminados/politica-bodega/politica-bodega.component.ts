import { Component, computed, inject, input, output, signal } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { DIAS_PARA_RECOGER, Orden, OrdenesService, diasDesde } from '../../../cajera/ordenes/ordenes.service';
import { formatearDinero } from '../../../compartido/formato';
import { diaMes } from '../../por-cotizar/existencia';
import { avisosDe } from '../avisos';

/** Cláusulas de bodega (Figma J8.2; luego vendrán de Configuración J9). */
export const ALMACENAJE_POR_DIA = 20;
export const DIAS_RESGUARDO = 90;

type Decision = 'cobrar' | 'avisar' | 'perdonar';

/** J8.2 · Aplicar política de bodega: cobrar almacenaje, último aviso o perdonarlo. */
@Component({
  selector: 'app-politica-bodega',
  standalone: true,
  templateUrl: './politica-bodega.component.html',
  styles: `
    .modal { max-width: 560px; }
    .datos { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 8px; background: var(--color-fondo); }
    .renglon { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--color-texto-tenue); }
    .renglon strong { font-weight: 600; text-align: right; color: var(--color-marino); }
    .renglon .peligro { color: var(--color-peligro); }
    .opciones { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; border: 0; }
    .opciones legend { margin-bottom: 12px; padding: 0; }
    .aviso img { margin-top: 1px; }
  `,
})
export class PoliticaBodegaComponent {
  private readonly servicio = inject(OrdenesService);
  private readonly jefe = inject(AuthService).sesion()?.nombre ?? '';

  readonly orden = input.required<Orden>();
  readonly cerrar = output<void>();
  readonly aplicada = output<string>();

  protected readonly dinero = formatearDinero;
  protected readonly diaMesDe = diaMes;
  protected readonly limite = DIAS_PARA_RECOGER;
  protected readonly porDia = ALMACENAJE_POR_DIA;
  protected readonly resguardo = DIAS_RESGUARDO;

  protected readonly dias = computed(() => diasDesde(this.orden().listaDesde ?? this.orden().recibido));
  protected readonly diasCobro = computed(() => Math.max(0, this.dias() - DIAS_PARA_RECOGER));
  protected readonly monto = computed(() => this.diasCobro() * ALMACENAJE_POR_DIA);
  protected readonly avisos = computed(() => avisosDe(this.orden()));
  protected readonly ultimo = computed(() => {
    const a = this.avisos().at(-1);
    return a ? `último hace ${diasDesde(a.fecha)} ${diasDesde(a.fecha) === 1 ? 'día' : 'días'}` : 'solo el de “Listo”';
  });

  protected readonly resultado = computed(() => {
    const o = this.orden();
    if (o.estado === 'sin-reparacion') return o.rechazo ? 'Rechazado' : 'Sin reparación';
    return o.estado === 'garantia-lista' ? 'Garantía' : 'Reparado';
  });

  protected readonly decision = signal<Decision>('cobrar');
  protected readonly opciones = computed(() => [
    { id: 'cobrar' as Decision, texto: 'Cobrar almacenaje al entregar', detalle: `Caja verá ${formatearDinero(this.monto())} extra en la entrega de ${this.orden().folio}` },
    { id: 'avisar' as Decision, texto: 'Enviar último aviso', detalle: 'Aparece en el portal y en el chat del cliente' },
    { id: 'perdonar' as Decision, texto: 'Perdonar almacenaje', detalle: 'Queda registrado con tu nombre' },
  ]);

  protected aplicar(): void {
    const o = this.orden();
    switch (this.decision()) {
      case 'cobrar':
        this.servicio.aplicarAlmacenaje(o.folio, { dias: this.diasCobro(), monto: this.monto(), perdonar: false, por: this.jefe });
        this.aplicada.emit(`${o.folio}: caja cobrará ${formatearDinero(this.monto())} de almacenaje al entregar`);
        break;
      case 'avisar':
        this.servicio.avisar(o.folio, 'Último aviso para recoger (portal y chat)');
        this.aplicada.emit(`${o.folio}: último aviso enviado a ${o.cliente.nombre} en su portal y su chat`);
        break;
      default:
        this.servicio.aplicarAlmacenaje(o.folio, { dias: this.diasCobro(), monto: 0, perdonar: true, por: this.jefe });
        this.aplicada.emit(`${o.folio}: almacenaje perdonado; queda registrado a tu nombre`);
    }
  }
}
