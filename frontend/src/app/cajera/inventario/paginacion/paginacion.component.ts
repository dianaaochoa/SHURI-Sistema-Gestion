import { Component, computed, input, model } from '@angular/core';

/** Figma › Paginación: "1–50 de 3,450 resultados", tamaño de página y ‹ 1 2 3 … 69 ›. */
@Component({
  selector: 'app-paginacion',
  standalone: true,
  template: `
    <div class="paginacion__texto">{{ rango() }}<ng-content /></div>
    <div class="paginacion__control">
      <label class="paginacion__tamano">
        <select aria-label="Resultados por página" [value]="porPagina()" (change)="porPagina.set(+$any($event.target).value); pagina.set(1)">
          @for (t of tamanos; track t) {
            <option [value]="t" [selected]="t === porPagina()">{{ t }} por página</option>
          }
        </select>
        <img src="assets/inventario/chev-d-14.svg" width="14" height="14" alt="" />
      </label>
      <button type="button" class="boton boton--secundario pagina" aria-label="Página anterior" [disabled]="actual() === 1" (click)="irA(actual() - 1)">‹</button>
      @for (n of botones(); track n) {
        <button type="button" class="boton pagina" [class.boton--primario]="n === actual()" [class.boton--secundario]="n !== actual()" [attr.aria-current]="n === actual() ? 'page' : null" (click)="irA(n)">{{ n }}</button>
      }
      @if (paginas() > 3) {
        <span class="paginacion__ultima">… <button type="button" (click)="irA(paginas())">{{ paginas() }}</button></span>
      }
      <button type="button" class="boton boton--contorno pagina" aria-label="Página siguiente" [disabled]="actual() === paginas()" (click)="irA(actual() + 1)">›</button>
    </div>
  `,
  styles: `
    :host { display: flex; flex: 1 0 56px; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 16px; font-size: 12px; color: var(--color-texto-tenue); }
    .paginacion__control { display: flex; align-items: center; gap: 8px; }
    .paginacion__tamano { display: flex; align-items: center; gap: 2px; }
    .paginacion__tamano select { border: 0; background: none; font: inherit; color: inherit; cursor: pointer; appearance: none; }
    .pagina { width: 32px; height: 32px; padding: 0; }
    .paginacion__ultima { color: var(--color-texto-secundario); }
    .paginacion__ultima button { padding: 0; border: 0; background: none; font: inherit; color: inherit; cursor: pointer; }
  `,
})
export class PaginacionComponent {
  readonly total = input.required<number>();
  readonly pagina = model(1);
  readonly porPagina = model(50);
  protected readonly tamanos = [25, 50, 100];

  readonly paginas = computed(() => Math.max(1, Math.ceil(this.total() / this.porPagina())));
  /** La página pedida, sin pasarse de la última (al filtrar puede haber menos). */
  readonly actual = computed(() => Math.min(this.pagina(), this.paginas()));
  protected readonly botones = computed(() => Array.from({ length: Math.min(this.paginas(), 3) }, (_, i) => i + 1));
  protected readonly rango = computed(() => {
    const total = this.total();
    if (!total) return '0 resultados';
    const desde = (this.actual() - 1) * this.porPagina();
    return `${desde + 1}–${Math.min(desde + this.porPagina(), total)} de ${total.toLocaleString('es-MX')} resultados`;
  });

  protected irA(pagina: number): void {
    this.pagina.set(Math.min(Math.max(1, pagina), this.paginas()));
  }
}

/** Los elementos de la página actual. */
export function paginar<T>(lista: T[], pagina: number, porPagina: number): T[] {
  const ultima = Math.max(1, Math.ceil(lista.length / porPagina));
  const desde = (Math.min(pagina, ultima) - 1) * porPagina;
  return lista.slice(desde, desde + porPagina);
}
