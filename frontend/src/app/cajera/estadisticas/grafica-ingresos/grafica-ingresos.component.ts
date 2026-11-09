import { Component, computed, input } from '@angular/core';
import { formatearDinero } from '../../../compartido/formato';
import { Grupo } from '../estadisticas.service';

/** C9 · "Ingresos por semana": barras de ventas y reparaciones por grupo, con globo al pasar o enfocar. */
@Component({
  selector: 'app-grafica-ingresos',
  standalone: true,
  template: `
    <h2 id="titulo-grafica">{{ titulo() }}</h2>
    <ul class="leyenda">
      <li><span class="muestra muestra--ventas"></span>Ventas</li>
      <li><span class="muestra muestra--reparaciones"></span>Reparaciones</li>
    </ul>
    <div class="barras" role="list" aria-labelledby="titulo-grafica" [class.barras--muchos]="grupos().length > 7">
      @for (g of grupos(); track g.etiqueta) {
        <div class="grupo" role="listitem" tabindex="0" [class.grupo--futuro]="g.futuro" [attr.aria-label]="etiqueta(g)">
          <div class="grupo__barras">
            @if (!g.futuro) {
              <span class="barra muestra--ventas" [style.height.%]="alto(g.ventas)"></span>
              <span class="barra muestra--reparaciones" [style.height.%]="alto(g.reparaciones)"></span>
            }
          </div>
          <span class="grupo__etiqueta">{{ g.etiqueta }}</span>
          <strong class="grupo__total">{{ g.futuro ? '—' : dinero(g.ventas + g.reparaciones, true) }}</strong>
          @if (!g.futuro) {
            <span class="globo" role="tooltip">
              <b>{{ g.etiqueta }}</b>
              <span><i class="muestra muestra--ventas"></i>Ventas {{ dinero(g.ventas) }}</span>
              <span><i class="muestra muestra--reparaciones"></i>Reparaciones {{ dinero(g.reparaciones) }}</span>
            </span>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; padding: 20px 16px; border: 1px solid var(--color-borde); border-radius: 8px; background: var(--color-superficie); }
    h2 { font-size: 15px; font-weight: 600; color: var(--color-marino); }
    .leyenda { display: flex; gap: 16px; margin: -4px 0 0; padding: 0; list-style: none; font-size: 12px; color: var(--color-texto-tenue); }
    .leyenda li { display: flex; align-items: center; gap: 6px; }
    .muestra { display: inline-block; flex-shrink: 0; width: 10px; height: 10px; border-radius: 2px; }
    .muestra--ventas { background: var(--color-primario); }
    .muestra--reparaciones { background: #33b1bd; }
    .barras { display: flex; flex: 1; min-height: 240px; padding: 0 24px; }
    .grupo { position: relative; display: flex; flex: 1; flex-direction: column; min-width: 0; align-items: center; gap: 4px; outline: none; }
    .grupo__barras { display: flex; flex: 1; align-items: flex-end; justify-content: center; gap: 4px; width: 100%; padding: 0 8%; margin-bottom: 8px; border-radius: 4px; }
    .barra { flex: 0 1 36px; min-width: 4px; height: 0; min-height: 2px; border-radius: 4px 4px 0 0; }
    .grupo__etiqueta { font-size: 12px; color: var(--color-texto-tenue); }
    .grupo__total { max-width: 100%; overflow: hidden; font-size: 13px; font-weight: 600; color: var(--color-marino); text-overflow: clip; white-space: nowrap; }
    .grupo--futuro .grupo__total { color: var(--color-placeholder); }
    .grupo:hover .grupo__barras, .grupo:focus-visible .grupo__barras { background: var(--color-fondo); }
    .grupo:focus-visible { outline: 2px solid var(--color-acento); outline-offset: 2px; border-radius: 4px; }
    .globo { position: absolute; top: 8px; left: 50%; z-index: 2; display: none; flex-direction: column; gap: 4px; padding: 8px 10px; border: 1px solid var(--color-borde); border-radius: 8px; background: var(--color-superficie); box-shadow: 0 8px 24px rgba(23, 56, 79, 0.12); font-size: 12px; color: var(--color-marino); white-space: nowrap; transform: translateX(-50%); pointer-events: none; }
    .globo span { display: flex; align-items: center; gap: 6px; }
    .grupo:hover .globo, .grupo:focus-visible .globo { display: flex; }
    @media (max-width: 768px) {
      .barras { min-height: 180px; padding: 0; }
      .grupo__barras { gap: 2px; padding: 0 4%; }
      /* 12 meses no caben con su total: queda en el globo (al tocar la barra). */
      .barras--muchos .grupo__total { display: none; }
      .barras--muchos .grupo__etiqueta { font-size: 10px; }
      .grupo__total { font-size: 10px; }
    }
  `,
})
export class GraficaIngresosComponent {
  readonly titulo = input.required<string>();
  readonly grupos = input.required<Grupo[]>();

  /** La barra más alta del periodo mide 100 %. */
  private readonly maximo = computed(() => Math.max(1, ...this.grupos().flatMap((g) => [g.ventas, g.reparaciones])));

  protected alto(valor: number): number {
    return (valor / this.maximo()) * 100;
  }

  protected dinero(importe: number, entero = false): string {
    return formatearDinero(importe, entero);
  }

  protected etiqueta(g: Grupo): string {
    return g.futuro ? `${g.etiqueta}: todavía no llega` : `${g.etiqueta}: ventas ${formatearDinero(g.ventas)}, reparaciones ${formatearDinero(g.reparaciones)}`;
  }
}
