import { Component, computed, input, model, output } from '@angular/core';
import { formatearDinero } from '../../../compartido/formato';
import { diaMes } from '../../ordenes/detalle-orden/detalle-orden.component';
import { Orden, diasGarantia, saldo, sumarDias } from '../../ordenes/ordenes.service';
import { MetodoSimple } from '../../punto-de-venta/venta.service';

export type TipoEntrega = 'normal' | 'sin-reparar' | 'garantia';

const METODOS: { id: MetodoSimple; texto: string; icono: string }[] = [
  { id: 'efectivo', texto: 'Efectivo', icono: 'cash' },
  { id: 'tarjeta', texto: 'Tarjeta', icono: 'card' },
  { id: 'transferencia', texto: 'Transf.', icono: 'transfer' },
];

/** C6 · Panel de cobro: cobro pendiente (C6.1/C6.4), revisión (C6.2) o costo de la garantía (C6.3). */
@Component({
  selector: 'app-cobro-entrega',
  standalone: true,
  template: `
    @if (orden(); as o) {
    <h2 class="panel-titulo">
      <img src="assets/entrega/cartera-primario.svg" width="16" height="16" alt="" />{{ tipo() === 'garantia' ? 'Costo de la garantía' : 'Cobro pendiente' }}
    </h2>

    @switch (tipo()) {
      @case ('garantia') {
        @if (o.garantia?.decision?.tipo === 'sin-reparar') {
          <p class="renglon"><span>Reparación</span><strong>No aplica · sin reparar</strong></p>
        } @else {
          <p class="renglon"><span>Mano de obra y refacción</span><strong>Cubierto</strong></p>
        }
        <p class="renglon"><span>Costo extra por daño nuevo</span><strong>{{ dinero(0) }}</strong></p>
      }
      @case ('sin-reparar') {
        <p class="renglon"><span>Revisión y diagnóstico</span><strong>{{ revision() ? dinero(revision()) : 'Sin costo' }}</strong></p>
        @if (o.anticipo) {
          <p class="renglon"><span>Anticipo recibido el {{ diaMes(o.recibido) }}</span><strong>− {{ dinero(o.anticipo) }}</strong></p>
        }
        @if (devolver()) {
          <p class="renglon"><span>Anticipo a devolver</span><strong>{{ dinero(devolver()) }}</strong></p>
        }
      }
      @default {
        <p class="renglon"><span>Total del trabajo (IVA incluido)</span><strong>{{ dinero(o.presupuesto?.total ?? 0) }}</strong></p>
        @if (o.anticipo) {
          <p class="renglon"><span>Anticipo recibido el {{ diaMes(o.recibido) }}</span><strong>− {{ dinero(o.anticipo) }}</strong></p>
        }
      }
    }
    @if (o.almacenaje?.monto) {
      <p class="renglon"><span>Almacenaje ({{ o.almacenaje!.dias }} días)</span><strong>{{ dinero(o.almacenaje!.monto) }}</strong></p>
    }
    <hr class="separador" />
    <p class="renglon renglon--total"><span>{{ tipo() === 'normal' ? 'Restante a cobrar' : 'Saldo a cobrar' }}</span><strong>{{ dinero(restante()) }}</strong></p>

    @if (restante() > 0) {
      <p class="campo__etiqueta" id="metodo-entrega">Método de pago</p>
      <div class="selector" role="radiogroup" aria-labelledby="metodo-entrega">
        @for (m of metodos; track m.id) {
          <button type="button" role="radio" class="selector__opcion" [class.selector__opcion--elegida]="metodo() === m.id" [attr.aria-checked]="metodo() === m.id" (click)="metodo.set(m.id)">
            <span class="icono" [style.--icono]="'url(assets/pdv/' + m.icono + '.svg)'"></span>{{ m.texto }}
          </button>
        }
      </div>
    }

    <p class="aviso aviso--info">
      <img src="assets/ordenes/circulo-check-16.svg" width="16" height="16" alt="" />
      {{ consecuencia() }}
    </p>

    <div class="espacio"></div>

    @if (tipo() === 'normal') {
      <label class="casilla">
        <input type="checkbox" [checked]="facturar()" (change)="factura.emit($any($event.target).checked)" />
        El cliente quiere factura{{ facturar() ? ' · ' + rfc() : ' (se piden sus datos al cobrar)' }}
      </label>
    }
    @if (falta()) {
      <p class="falta" role="status">{{ falta() }}</p>
    }
    <button type="button" class="boton boton--primario cobrar" [disabled]="!!falta()" (click)="entregar.emit()">
      <img src="assets/ordenes/paquete-blanco.svg" width="16" height="16" alt="" />{{ textoBoton() }}
    </button>
    <button type="button" class="boton boton--contorno boton--40" (click)="imprimir.emit()">
      <img src="assets/ventas/printer-primario.svg" width="16" height="16" alt="" />Imprimir comprobante de {{ tipo() === 'garantia' ? 'garantía' : tipo() === 'sin-reparar' ? 'devolución' : 'entrega' }}
    </button>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid var(--color-borde); border-radius: 8px; background: var(--color-superficie); }
    .panel-titulo { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--color-marino); }
    .renglon { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; color: var(--color-texto-tenue); }
    .renglon strong { font-weight: 600; color: var(--color-marino); }
    .renglon--total span { font-size: 14px; font-weight: 600; color: var(--color-marino); }
    .renglon--total strong { font-size: 28px; font-weight: 700; }
    .separador { width: 100%; margin: 0; border: 0; border-top: 1px solid var(--color-borde); }
    .aviso--info { padding: 12px; background: var(--color-primario-suave); }
    .espacio { flex: 1; }
    .falta { font-size: 12px; color: var(--color-advertencia); }
    .cobrar { height: 48px; }
  `,
})
export class CobroEntregaComponent {
  readonly orden = input.required<Orden>();
  readonly tipo = input.required<TipoEntrega>();
  /** Nombre de quien recoge si no es el titular (C6.4). */
  readonly otraPersona = input('');
  /** Lo que falta para poder entregar; vacío si ya se puede. */
  readonly falta = input('');
  readonly facturar = input(false);
  readonly rfc = input('');
  readonly metodo = model<MetodoSimple>('efectivo');
  readonly entregar = output<void>();
  readonly imprimir = output<void>();
  readonly factura = output<boolean>();

  protected readonly metodos = METODOS;
  protected readonly dinero = formatearDinero;
  protected readonly diaMes = diaMes;
  protected readonly restante = computed(() => saldo(this.orden()));
  /** Revisión de un equipo sin reparación: la que fijó el jefe (J3.3) o, en las anteriores, el anticipo. */
  protected readonly revision = computed(() => {
    const o = this.orden();
    return o.revision ? (o.revision.cobrar ? o.revision.monto : 0) : o.anticipo;
  });
  protected readonly devolver = computed(() => (this.tipo() === 'sin-reparar' ? Math.max(0, this.orden().anticipo - this.revision()) : 0));

  protected readonly consecuencia = computed(() => {
    const o = this.orden();
    if (this.tipo() === 'garantia') {
      return 'Al confirmar se imprime el comprobante de entrega de garantía y el seguimiento del portal pasa a “Terminado tras garantía”. La garantía original no se reinicia.';
    }
    if (this.tipo() === 'sin-reparar') {
      if (this.devolver()) return `Devuelve ${this.dinero(this.devolver())} del anticipo al cliente. Al confirmar se imprime el comprobante de devolución sin reparación y el folio se cierra como “Entregado sin reparar”. No genera garantía.`;
      if (this.restante() > 0) return 'Al confirmar se cobra la revisión, se imprime el comprobante de devolución sin reparación y el folio se cierra como “Entregado sin reparar”. No genera garantía.';
      return 'No hay saldo. Al confirmar se imprime el comprobante de devolución sin reparación y el folio se cierra como “Entregado sin reparar”. No genera garantía.';
    }
    if (this.otraPersona()) {
      return `El comprobante de entrega se imprime a nombre del titular e indica quién recogió. ${o.cliente.nombre.split(' ')[0]} recibe el aviso de entrega en su portal.`;
    }
    const vence = diaMes(sumarDias(new Date().toISOString(), diasGarantia()));
    return `Al confirmar: se imprime el comprobante de entrega, el folio pasa a “Terminado”, inicia la garantía (vence ${vence}) y se notifica al cliente en su portal.`;
  });

  protected readonly textoBoton = computed(() => {
    if (this.tipo() === 'garantia') return 'Entregar equipo de garantía';
    if (this.tipo() === 'sin-reparar') return this.restante() > 0 ? `Cobrar ${this.dinero(this.restante())} y entregar sin reparar` : 'Entregar sin reparar';
    return this.restante() > 0 ? `Cobrar ${this.dinero(this.restante())} y entregar` : 'Entregar equipo';
  });
}
