import { Component, computed, input } from '@angular/core';
import { Orden } from '../../../cajera/ordenes/ordenes.service';

/** Tarjeta del equipo con sus datos y el PIN que capturó caja (Figma T3.1–T3.10). */
@Component({
  selector: 'app-ficha-equipo',
  standalone: true,
  template: `
    <span class="ficha__icono"><span class="icono" style="--icono: url(assets/iconos/smartphone.svg)"></span></span>
    <div class="ficha__texto">
      <h2>{{ titulo() }}</h2>
      @for (l of lineas(); track $index) {
        <p>{{ l }}</p>
      }
    </div>
    <div class="ficha__pin">
      <span>PIN del equipo</span>
      <strong>{{ orden().ficha?.pin || '—' }}</strong>
    </div>
  `,
  styles: `
    :host { display: flex; align-items: flex-start; gap: 16px; padding: 16px; border: 1px solid var(--color-borde); border-radius: 8px; background: var(--color-superficie); }
    .ficha__icono { display: flex; flex-shrink: 0; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 8px; background: var(--color-primario-suave); color: var(--color-primario); }
    .ficha__icono .icono { width: 22px; height: 22px; }
    .ficha__texto { display: flex; flex: 1; flex-direction: column; gap: 3px; min-width: 0; font-size: 12px; color: var(--color-texto-tenue); }
    h2 { margin-bottom: 2px; font-size: 17px; font-weight: 700; color: var(--color-marino); }
    .ficha__pin { display: flex; flex-shrink: 0; flex-direction: column; align-items: center; gap: 2px; padding: 10px 14px; border-radius: 8px; background: var(--color-fondo); }
    .ficha__pin span { font-size: 10px; font-weight: 600; text-transform: uppercase; color: var(--color-texto-tenue); }
    .ficha__pin strong { font-size: 22px; font-weight: 700; letter-spacing: 0.04em; color: var(--color-marino); }
    @media (max-width: 600px) { :host { flex-wrap: wrap; } .ficha__pin { flex-direction: row; gap: 10px; } }
  `,
})
export class FichaEquipoComponent {
  readonly orden = input.required<Orden>();
  readonly lineas = input<string[]>([]);

  /** "Apple iPhone 14 · Medianoche" */
  protected readonly titulo = computed(() => {
    const f = this.orden().ficha;
    const nombre = f ? `${f.marca} ${f.modelo}`.trim() : this.orden().equipo;
    return f?.color ? `${nombre} · ${f.color}` : nombre || this.orden().equipo;
  });
}
