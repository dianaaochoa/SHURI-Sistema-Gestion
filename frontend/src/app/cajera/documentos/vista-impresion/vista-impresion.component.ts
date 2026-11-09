import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, signal } from '@angular/core';
import { OrdenCartaComponent } from '../orden-carta/orden-carta.component';
import { TicketComponent } from '../ticket/ticket.component';
import { Documento, DocumentosService, folioDe } from '../documentos.service';

const NOMBRES: Record<Documento['tipo'], string> = {
  venta: 'Ticket de venta',
  orden: 'Orden de servicio',
  entrega: 'Comprobante de entrega',
  devolucion: 'Devolución de mercancía',
  garantia: 'Recepción en garantía',
  corte: 'Corte de caja',
  movimiento: 'Movimiento de efectivo',
};

/**
 * C11 · Vista de impresión. Se abre cuando la app imprime un documento; "Imprimir" manda
 * solo la hoja a la impresora del navegador (rollo de 80 mm o carta). Enter imprime y Esc cierra.
 */
@Component({
  selector: 'app-vista-impresion',
  standalone: true,
  imports: [TicketComponent, OrdenCartaComponent],
  template: `
    @if (doc(); as d) {
      <div class="vista" role="dialog" aria-modal="true" aria-labelledby="titulo-vista">
        <header class="vista__barra">
          <div>
            <h2 id="titulo-vista">{{ nombre() }} · {{ folio() }}</h2>
            <p>Vista de impresión · {{ carta() ? 'hoja carta' : 'rollo de 80 mm' }}</p>
          </div>
          @if (d.tipo === 'orden') {
            <div class="alternar" role="radiogroup" aria-label="Formato">
              <button type="button" role="radio" [class.activo]="!carta()" [attr.aria-checked]="!carta()" (click)="formato.set('ticket')">Ticket</button>
              <button type="button" role="radio" [class.activo]="carta()" [attr.aria-checked]="carta()" (click)="formato.set('carta')">Carta</button>
            </div>
          }
          <div class="vista__acciones">
            <button type="button" class="boton boton--contorno boton--40" (click)="cerrar()">Cerrar</button>
            <button type="button" class="boton boton--primario boton--40" (click)="imprimir()">
              <span class="icono" style="--icono: url(assets/pdv/printer.svg)"></span>Imprimir
            </button>
          </div>
        </header>
        <div class="vista__papel">
          @if (d.tipo === 'orden' && carta()) {
            <app-orden-carta [orden]="d.orden" />
          } @else {
            <app-ticket [doc]="d" />
          }
        </div>
      </div>
    }
  `,
  styles: `
    .vista { position: fixed; inset: 0; z-index: 80; display: flex; flex-direction: column; background: rgba(15, 23, 42, 0.72); }
    .vista__barra { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; padding: 12px 24px; background: var(--color-superficie); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12); }
    .vista__barra > div:first-child { flex: 1; min-width: 180px; }
    h2 { font-size: 16px; font-weight: 700; color: var(--color-marino); }
    .vista__barra p { font-size: 12px; color: var(--color-texto-tenue); }
    .alternar button { height: 38px; font: 600 13px var(--fuente); color: var(--color-texto-secundario); cursor: pointer; }
    .alternar .activo { background: var(--color-primario); color: var(--color-superficie); }
    .vista__acciones { display: flex; gap: 8px; }
    .vista__acciones .icono { width: 16px; height: 16px; }
    .vista__papel { flex: 1; overflow: auto; padding: 24px; text-align: center; }
    .vista__papel > * { display: inline-block; text-align: left; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3); }
    @media (max-width: 560px) {
      .vista__barra { padding: 12px 16px; }
      .vista__acciones { flex: 1 1 100%; }
      .vista__acciones .boton { flex: 1; }
      .vista__papel { padding: 16px 0; }
    }
  `,
})
export class VistaImpresionComponent implements AfterViewInit, OnDestroy {
  private readonly documentos = inject(DocumentosService);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly doc = this.documentos.actual;
  protected readonly formato = signal<'ticket' | 'carta'>('ticket');
  protected readonly carta = computed(() => {
    const d = this.doc();
    return d?.tipo === 'orden' && this.formato() === 'carta';
  });
  protected readonly nombre = computed(() => (this.doc() ? NOMBRES[this.doc()!.tipo] : ''));
  protected readonly folio = computed(() => (this.doc() ? folioDe(this.doc()!) : ''));

  /**
   * Mientras está abierta, ninguna tecla llega al resto de la app (atajos del punto de venta, Esc de otros modales).
   * Esc cierra; Enter imprime, salvo sobre un botón de la vista (ahí Enter lo pulsa); Tab sigue moviendo el foco.
   */
  private readonly teclado = (evento: KeyboardEvent) => {
    if (!this.doc() || evento.key === 'Tab') return;
    const enBoton = !!(evento.target as HTMLElement).closest?.('.vista button');
    if (evento.key === 'Escape') {
      evento.preventDefault();
      this.cerrar();
    } else if (evento.key === 'Enter' && !enBoton) {
      evento.preventDefault();
      this.imprimir();
    }
    evento.stopImmediatePropagation();
  };

  ngAfterViewInit(): void {
    window.addEventListener('keydown', this.teclado, true);
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.teclado, true);
  }

  protected cerrar(): void {
    this.formato.set('ticket');
    this.documentos.cerrar();
  }

  /** Copia la hoja con los estilos de la app a un marco oculto y lo imprime (así no salen menús ni fondos). */
  protected imprimir(): void {
    const hoja = this.elemento.nativeElement.querySelector('.hoja-impresion');
    if (!hoja) return;
    const estilos = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((n) => n.outerHTML)
      .join('');
    const pagina = this.carta() ? '@page { size: letter; margin: 0; }' : '@page { size: 80mm auto; margin: 0; }';
    const marco = document.createElement('iframe');
    marco.setAttribute('aria-hidden', 'true');
    marco.style.cssText = 'position: fixed; right: 0; bottom: 0; width: 0; height: 0; border: 0;';
    document.body.appendChild(marco);
    const d = marco.contentDocument!;
    d.open();
    d.write(
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><base href="${document.baseURI}">${estilos}` +
        `<style>${pagina} html, body { margin: 0; background: #fff !important; } .hoja-impresion { box-shadow: none !important; }</style>` +
        `</head><body>${hoja.outerHTML}</body></html>`,
    );
    d.close();
    setTimeout(() => {
      marco.contentWindow?.focus();
      marco.contentWindow?.print();
      setTimeout(() => marco.remove(), 1000);
    }, 400);
  }
}
