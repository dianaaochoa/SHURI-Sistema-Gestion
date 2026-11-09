import { Component, HostListener, OnInit, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { formatearDinero } from '../../../compartido/formato';
import { DIAS_PARA_RECOGER, Orden, diasDesde, saldo } from '../ordenes.service';

export const UBICACIONES = ['Bodega trasera', 'Almacén planta alta'];

export interface EnvioBodega {
  folios: string[];
  ubicacion: string;
  estante: string;
  avisar: boolean;
}

/** C4.7 · Enviar equipos a bodega (modal). */
@Component({
  selector: 'app-enviar-bodega',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <section class="modal bodega" role="dialog" aria-modal="true" aria-labelledby="titulo-bodega" (click)="$event.stopPropagation()">
        <header class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-bodega">Enviar equipos a bodega</h2>
            <p class="modal__subtitulo">Equipos con más de {{ dias }} días desde el aviso de “Listo”</p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()">
            <img src="assets/pdv/x.svg" width="20" height="20" alt="" />
          </button>
        </header>

        <div class="equipos" role="table" aria-label="Equipos por enviar">
          <div class="equipos__fila equipos__encabezado" role="row">
            <span role="columnheader"></span>
            <span role="columnheader">Folio</span>
            <span role="columnheader">Cliente / equipo</span>
            <span role="columnheader" class="equipos__dias">Días</span>
            <span role="columnheader" class="equipos__saldo">Saldo</span>
          </div>
          @for (o of ordenes(); track o.folio) {
            <label class="equipos__fila" role="row" [class.equipos__fila--elegida]="elegidos().includes(o.folio)">
              <span class="casilla" role="cell">
                <input type="checkbox" [checked]="elegidos().includes(o.folio)" (change)="alternar(o.folio)" [attr.aria-label]="'Enviar ' + o.folio" />
              </span>
              <span role="cell">{{ o.folio }}</span>
              <span role="cell" class="equipos__cliente">{{ o.cliente.nombre }} · {{ o.equipo }}</span>
              <span role="cell" class="equipos__dias">{{ diasDe(o) }}</span>
              <strong role="cell" class="equipos__saldo">{{ dinero(saldoDe(o)) }}</strong>
            </label>
          } @empty {
            <p class="equipos__vacio">No hay equipos con más de {{ dias }} días sin recoger.</p>
          }
        </div>

        <div class="bodega__fila">
          <div class="campo">
            <label class="campo__etiqueta" for="ubicacion">Ubicación en bodega *</label>
            <div class="campo__control campo__control--40">
              <img src="assets/ordenes/bodega-gris.svg" width="16" height="16" alt="" />
              <select id="ubicacion" class="campo__input campo__select" [(ngModel)]="ubicacion">
                @for (u of ubicaciones; track u) {
                  <option [value]="u">{{ u }}</option>
                }
              </select>
              <img src="assets/cajera/chev-d.svg" width="16" height="16" alt="" />
            </div>
          </div>
          <div class="campo">
            <label class="campo__etiqueta" for="estante">Estante / caja</label>
            <div class="campo__control campo__control--40">
              <input id="estante" class="campo__input" autocomplete="off" maxlength="12" [(ngModel)]="estante" />
            </div>
          </div>
        </div>

        <label class="casilla"><input type="checkbox" [(ngModel)]="avisar" />Avisar a los clientes en su portal que su equipo pasó a bodega</label>

        <p class="aviso aviso--advertencia">
          <img src="assets/ventas/alert-advertencia.svg" width="16" height="16" alt="" />
          A partir de este momento el taller ya no es responsable por el deterioro del equipo (cláusula 4). El equipo puede entregarse cuando el cliente lo solicite.
        </p>

        <div class="modal__acciones">
          <button type="button" class="boton boton--contorno boton--44" (click)="cerrar.emit()">Cancelar</button>
          <button type="button" class="boton boton--primario boton--44" [disabled]="!elegidos().length" (click)="enviar()">
            <img src="assets/ordenes/bodega-blanco.svg" width="16" height="16" alt="" />Enviar {{ elegidos().length }} {{ elegidos().length === 1 ? 'equipo' : 'equipos' }} a bodega
          </button>
        </div>
      </section>
    </div>
  `,
  styles: `
    .bodega { max-width: 640px; }
    .equipos { overflow: hidden; border: 1px solid var(--color-borde); border-radius: 8px; }
    .equipos__fila { display: grid; grid-template-columns: 28px 64px minmax(0, 1fr) 48px 90px; gap: 8px; align-items: center; min-height: 42px; padding: 0 16px; border-top: 1px solid var(--color-borde); font-size: 12px; color: var(--color-marino); cursor: pointer; }
    .equipos__encabezado { min-height: 40px; border-top: 0; background: var(--color-fondo); font-size: 11px; font-weight: 600; color: var(--color-texto-secundario); cursor: default; }
    .equipos__fila--elegida { background: var(--color-primario-suave); }
    .equipos__cliente { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .equipos__dias { text-align: center; color: var(--color-texto-tenue); }
    .equipos__encabezado .equipos__dias { color: inherit; }
    .equipos__saldo { justify-self: end; font-weight: 600; }
    .equipos__vacio { padding: 16px; font-size: 12px; text-align: center; color: var(--color-texto-tenue); }
    .bodega__fila { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .bodega__fila .campo__control { gap: 8px; }
    .aviso--advertencia { align-items: flex-start; }
    @media (max-width: 560px) {
      .equipos__fila { grid-template-columns: 24px 52px minmax(0, 1fr) 70px; padding: 0 12px; }
      .equipos__dias { display: none; }
      .bodega__fila { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class EnviarBodegaComponent implements OnInit {
  /** Órdenes vencidas que se pueden enviar. */
  readonly ordenes = input.required<Orden[]>();
  /** Folio que se abrió desde el panel (va marcado). */
  readonly folioInicial = input<string | null>(null);
  readonly estanteSugerido = input('B-4');
  readonly cerrar = output<void>();
  readonly enviado = output<EnvioBodega>();

  protected readonly dinero = formatearDinero;
  protected readonly dias = DIAS_PARA_RECOGER;
  protected readonly ubicaciones = UBICACIONES;
  protected ubicacion = UBICACIONES[0];
  protected estante = '';
  protected avisar = true;
  protected readonly elegidos = signal<string[]>([]);
  protected readonly saldoDe = saldo;

  protected diasDe(orden: Orden): number {
    return diasDesde(orden.listaDesde!);
  }

  protected readonly total = computed(() => this.elegidos().length);

  ngOnInit(): void {
    this.estante = this.estanteSugerido();
    // Como en Figma: van marcados los que ya pasaron de los 30 días (o el que se eligió en el panel).
    const inicial = this.folioInicial();
    this.elegidos.set(inicial ? [inicial] : this.ordenes().filter((o) => this.diasDe(o) > DIAS_PARA_RECOGER).map((o) => o.folio));
  }

  protected alternar(folio: string): void {
    this.elegidos.update((lista) => (lista.includes(folio) ? lista.filter((f) => f !== folio) : [...lista, folio]));
  }

  protected enviar(): void {
    if (!this.elegidos().length) return;
    this.enviado.emit({ folios: this.elegidos(), ubicacion: this.ubicacion, estante: this.estante.trim() || 'Sin estante', avisar: this.avisar });
  }

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    this.cerrar.emit();
  }
}
