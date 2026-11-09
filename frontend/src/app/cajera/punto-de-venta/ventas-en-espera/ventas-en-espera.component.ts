import { Component, DestroyRef, HostListener, inject, output, signal } from '@angular/core';
import { formatearDinero, formatearDuracion, formatearHora } from '../../../compartido/formato';
import { VentaPausada, VentaService, calcularTotales } from '../venta.service';

/** C2.9 · Ventas en espera (modal): retomar o descartar las ventas pausadas del turno. */
@Component({
  selector: 'app-ventas-en-espera',
  standalone: true,
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <section class="modal espera" role="dialog" aria-modal="true" aria-labelledby="titulo-espera" (click)="$event.stopPropagation()">
        <header class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-espera">Ventas en espera</h2>
            <p class="modal__subtitulo">
              @if (venta.vacia()) {
                Retoma una venta para seguir cobrándola
              } @else {
                La venta actual ({{ venta.folio() }}) se pausará al retomar otra
              }
            </p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()">
            <img src="assets/pdv/x.svg" width="20" height="20" alt="" />
          </button>
        </header>

        <div class="espera__lista">
          @for (pausada of venta.pausadas(); track pausada.folio) {
            <article class="pausada">
              <div class="pausada__fila">
                <div>
                  <h3 class="pausada__titulo">{{ pausada.folio }} · {{ pausada.cliente.nombre }}</h3>
                  <p class="pausada__hora">{{ cuando(pausada) }}</p>
                </div>
                <strong class="pausada__total">{{ dinero(total(pausada)) }}</strong>
              </div>
              <div class="pausada__detalle">
                <span>{{ resumen(pausada) }}</span>
                @if (pausada.nota) {
                  <span class="estado estado--neutro">Nota: {{ pausada.nota }}</span>
                }
              </div>
              <div class="pausada__acciones">
                <button type="button" class="boton pausada__descartar" (click)="venta.descartar(pausada.folio)">
                  <img src="assets/pdv/trash-16.svg" width="16" height="16" alt="" />Descartar
                </button>
                <button type="button" class="boton boton--primario pausada__retomar" (click)="retomar(pausada.folio)">
                  <img src="assets/pdv/play-blanco.svg" width="16" height="16" alt="" />Retomar venta
                </button>
              </div>
            </article>
          } @empty {
            <p class="espera__vacio">No hay ventas en espera.</p>
          }
        </div>

        <p class="aviso espera__aviso">
          <img src="assets/pdv/alert-info.svg" width="16" height="16" alt="" />
          Las ventas en espera no apartan inventario y se descartan solas al cerrar el turno.
        </p>

        <div class="modal__acciones">
          <button type="button" class="boton boton--contorno boton--44" (click)="cerrar.emit()">Cerrar</button>
        </div>
      </section>
    </div>
  `,
  styles: `
    .espera { max-width: 640px; }
    .espera__lista { display: flex; flex-direction: column; gap: 10px; }
    .pausada { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border: 1px solid var(--color-borde); border-radius: 8px; }
    .pausada__fila { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .pausada__titulo { font-size: 14px; font-weight: 600; color: var(--color-marino); }
    .pausada__hora { margin-top: 2px; font-size: 12px; color: var(--color-texto-tenue); }
    .pausada__total { font-size: 18px; color: var(--color-marino); white-space: nowrap; }
    .pausada__detalle { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; color: var(--color-texto-secundario); }
    .pausada__acciones { display: flex; flex-wrap: wrap; gap: 8px; }
    .pausada__acciones .boton { height: 36px; white-space: nowrap; }
    .pausada__descartar { border: 1px solid var(--color-peligro); background: var(--color-superficie); color: var(--color-peligro); }
    .pausada__descartar:hover { background: var(--color-peligro-suave); }
    .pausada__retomar { flex: 1; }
    .espera__aviso { background: var(--color-primario-suave); }
    .espera__vacio { padding: 24px; border: 1px dashed var(--color-borde); border-radius: 8px; font-size: 13px; text-align: center; color: var(--color-texto-tenue); }
  `,
})
export class VentasEnEsperaComponent {
  readonly cerrar = output<void>();
  readonly retomada = output<string>();

  protected readonly venta = inject(VentaService);
  protected readonly dinero = formatearDinero;
  /** Para "hace 4 min"; se refresca cada 30 s. */
  private readonly ahora = signal(new Date());

  constructor() {
    const reloj = setInterval(() => this.ahora.set(new Date()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }

  protected total(pausada: VentaPausada): number {
    return calcularTotales(pausada.lineas, pausada.descuento).total;
  }

  /** "Pausada 13:51 · hace 4 min" */
  protected cuando(pausada: VentaPausada): string {
    const desde = new Date(pausada.pausadaEn);
    const recien = this.ahora().getTime() - desde.getTime() < 60_000;
    return `Pausada ${formatearHora(desde)} · ${recien ? 'hace un momento' : 'hace ' + formatearDuracion(desde, this.ahora())}`;
  }

  /** "3 artículos · Funda, mica y cable" */
  protected resumen(pausada: VentaPausada): string {
    const articulos = pausada.lineas.reduce((suma, l) => suma + l.cantidad, 0);
    const nombres = pausada.lineas.map((l, i) => {
      const corto = l.nombre.split(' ')[0];
      return i === 0 ? corto : corto.charAt(0).toLowerCase() + corto.slice(1);
    });
    const lista = nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : nombres[0];
    return `${articulos} ${articulos === 1 ? 'artículo' : 'artículos'} · ${lista}`;
  }

  protected retomar(folio: string): void {
    this.venta.retomar(folio);
    this.retomada.emit(folio);
  }

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    this.cerrar.emit();
  }
}
