import { AfterViewInit, Component, ElementRef, HostListener, inject, output, signal } from '@angular/core';
import { formatearDinero } from '../../../compartido/formato';
import { VentaService } from '../venta.service';

/** C2.8 · Pausar venta (modal): la venta pasa a "En espera" y la caja queda libre. */
@Component({
  selector: 'app-pausar-venta',
  standalone: true,
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <section class="modal pausar" role="dialog" aria-modal="true" aria-labelledby="titulo-pausar" (click)="$event.stopPropagation()">
        <header class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-pausar">Pausar venta {{ venta.folio() }}</h2>
            <p class="modal__subtitulo">
              {{ venta.articulos() }} {{ venta.articulos() === 1 ? 'artículo' : 'artículos' }} · {{ dinero(venta.total()) }} ·
              {{ venta.cliente().nombre }}
            </p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()">
            <img src="assets/pdv/x.svg" width="20" height="20" alt="" />
          </button>
        </header>

        <div class="campo">
          <label class="campo__etiqueta" for="nota-pausa">Nota para identificarla (opcional)</label>
          <div class="campo__control campo__control--40">
            <input id="nota-pausa" class="campo__input" autocomplete="off" maxlength="60" [value]="nota()" (input)="nota.set($any($event.target).value)" />
          </div>
        </div>

        <p class="pausar__texto">La venta queda guardada en “En espera” y la caja queda libre para atender a otro cliente.</p>

        <div class="modal__acciones">
          <button type="button" class="boton boton--contorno boton--44" (click)="cerrar.emit()">Cancelar</button>
          <button type="button" class="boton boton--primario boton--44" (click)="pausar()">
            <img src="assets/pdv/pause-blanco.svg" width="16" height="16" alt="" />Pausar venta
          </button>
        </div>
      </section>
    </div>
  `,
  styles: `
    .pausar { max-width: 480px; }
    .pausar__texto { font-size: 12px; color: var(--color-texto-tenue); }
    .campo__control:focus-within { border-color: var(--color-primario); }
  `,
})
export class PausarVentaComponent implements AfterViewInit {
  readonly cerrar = output<void>();
  readonly pausada = output<string>();

  protected readonly venta = inject(VentaService);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly dinero = formatearDinero;
  protected readonly nota = signal('');

  ngAfterViewInit(): void {
    this.elemento.nativeElement.querySelector('input')?.focus();
  }

  protected pausar(): void {
    const folio = this.venta.folio();
    this.venta.pausar(this.nota());
    this.pausada.emit(folio);
  }

  @HostListener('document:keydown', ['$event'])
  protected alPresionarTecla(evento: KeyboardEvent): void {
    if (evento.key === 'Escape') this.cerrar.emit();
    if (evento.key === 'Enter' && (evento.target as HTMLElement).tagName === 'INPUT') {
      evento.preventDefault();
      this.pausar();
    }
  }
}
