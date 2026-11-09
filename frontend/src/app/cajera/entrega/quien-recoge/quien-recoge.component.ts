import { Component, OnChanges, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';

export const IDENTIFICACIONES = ['INE', 'Pasaporte', 'Licencia de conducir', 'Cédula profesional'];
const RELACIONES = ['Hermana / hermano', 'Pareja', 'Madre / padre', 'Hija / hijo', 'Amiga / amigo', 'Compañero de trabajo', 'Otra'];

export interface Recoge {
  tipo: 'titular' | 'otra';
  nombre: string;
  relacion: string;
  identificacion: string;
  cartaPoder: boolean;
  copiaTitular: boolean;
  foto: boolean;
  /** Ya se puede entregar a esta persona. */
  completo: boolean;
}

/** C6.1 / C6.4 · ¿Quién recoge el equipo? */
@Component({
  selector: 'app-quien-recoge',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet],
  template: `
    <h2 class="panel-titulo"><img src="assets/entrega/usuario-primario.svg" width="16" height="16" alt="" />¿Quién recoge el equipo?</h2>
    <div class="selector" role="radiogroup" aria-label="Quién recoge">
      <button type="button" role="radio" class="selector__opcion" [class.selector__opcion--elegida]="tipo() === 'titular'" [attr.aria-checked]="tipo() === 'titular'" (click)="elegir('titular')">
        <span class="icono" style="--icono: url(assets/entrega/usuario-20.svg)"></span>El titular
      </button>
      <button type="button" role="radio" class="selector__opcion" [class.selector__opcion--elegida]="tipo() === 'otra'" [attr.aria-checked]="tipo() === 'otra'" (click)="elegir('otra')">
        <span class="icono" style="--icono: url(assets/entrega/usuarios-20.svg)"></span>Otra persona
      </button>
    </div>

    @if (tipo() === 'titular') {
      <div class="rejilla rejilla--2">
        <div class="campo">
          <span class="campo__etiqueta">Nombre de quien recoge</span>
          <div class="campo__control campo__control--40 campo__control--fijo"><span class="campo__input">{{ titular() }} (titular)</span></div>
        </div>
        <ng-container *ngTemplateOutlet="identificacionTpl" />
      </div>
      <p class="nota">Si elige “Otra persona” se piden su nombre, relación con el titular, identificación y la carta poder firmada.</p>
    } @else {
      <div class="rejilla rejilla--3">
        <div class="campo">
          <label class="campo__etiqueta" for="recoge-nombre">Nombre de quien recoge *</label>
          <div class="campo__control campo__control--40">
            <input id="recoge-nombre" class="campo__input" autocomplete="off" [(ngModel)]="nombre" (ngModelChange)="avisar()" />
          </div>
        </div>
        <div class="campo">
          <label class="campo__etiqueta" for="recoge-relacion">Relación con el titular</label>
          <div class="campo__control campo__control--40">
            <select id="recoge-relacion" class="campo__input campo__select" [(ngModel)]="relacion" (ngModelChange)="avisar()">
              @for (r of relaciones; track r) {
                <option [value]="r">{{ r }}</option>
              }
            </select>
            <img src="assets/cajera/chev-d.svg" width="16" height="16" alt="" />
          </div>
        </div>
        <ng-container *ngTemplateOutlet="identificacionTpl" />
      </div>
      <div class="documentos">
        <label class="casilla"><input type="checkbox" [(ngModel)]="cartaPoder" (ngModelChange)="avisar()" />Carta poder firmada por el titular</label>
        <label class="casilla"><input type="checkbox" [(ngModel)]="copiaTitular" (ngModelChange)="avisar()" />Copia de identificación del titular</label>
        <button type="button" class="enlace" (click)="foto = !foto; avisar()">
          @if (foto) {
            <img src="assets/ordenes/circulo-check-16.svg" width="14" height="14" alt="" />Foto de la carta poder adjunta
          } @else {
            <img src="assets/pdv/plus-14-primario.svg" width="14" height="14" alt="" />Tomar foto de la carta poder
          }
        </button>
      </div>
    }

    <ng-template #identificacionTpl>
      <div class="campo">
        <label class="campo__etiqueta" for="recoge-identificacion">Identificación presentada *</label>
        <div class="campo__control campo__control--40">
          <img src="assets/entrega/identificacion.svg" width="16" height="16" alt="" />
          <select id="recoge-identificacion" class="campo__input campo__select" [(ngModel)]="identificacion" (ngModelChange)="avisar()">
            @for (i of identificaciones; track i) {
              <option [value]="i">{{ i }}</option>
            }
          </select>
          <img src="assets/cajera/chev-d.svg" width="16" height="16" alt="" />
        </div>
      </div>
    </ng-template>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid var(--color-borde); border-radius: 8px; background: var(--color-superficie); }
    .panel-titulo { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--color-marino); }
    .rejilla { display: grid; gap: 12px; }
    .rejilla--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .rejilla--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .campo__control { gap: 8px; }
    .nota { font-size: 11px; color: var(--color-texto-tenue); }
    .documentos { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 24px; }
    .enlace { gap: 6px; font-size: 12px; }
    @media (max-width: 640px) {
      .rejilla--2, .rejilla--3 { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class QuienRecogeComponent implements OnChanges {
  /** Nombre del titular de la orden. */
  readonly titular = input.required<string>();
  readonly cambio = output<Recoge>();

  protected readonly identificaciones = IDENTIFICACIONES;
  protected readonly relaciones = RELACIONES;
  protected readonly tipo = signal<'titular' | 'otra'>('titular');
  protected nombre = '';
  protected relacion = RELACIONES[0];
  protected identificacion = IDENTIFICACIONES[0];
  protected cartaPoder = false;
  protected copiaTitular = false;
  protected foto = false;

  /** Al cambiar de orden se vuelve a "El titular". */
  ngOnChanges(): void {
    this.tipo.set('titular');
    this.nombre = '';
    this.cartaPoder = this.copiaTitular = this.foto = false;
    this.identificacion = IDENTIFICACIONES[0];
    // Se avisa después del ciclo para no cambiar el estado del padre mientras se dibuja.
    queueMicrotask(() => this.avisar());
  }

  protected elegir(tipo: 'titular' | 'otra'): void {
    this.tipo.set(tipo);
    this.avisar();
  }

  protected avisar(): void {
    const otra = this.tipo() === 'otra';
    this.cambio.emit({
      tipo: this.tipo(),
      nombre: otra ? this.nombre.trim() : this.titular(),
      relacion: otra ? this.relacion : '',
      identificacion: this.identificacion,
      cartaPoder: this.cartaPoder,
      copiaTitular: this.copiaTitular,
      foto: this.foto,
      completo: !otra || (this.nombre.trim().split(/\s+/).length >= 2 && this.cartaPoder && this.copiaTitular),
    });
  }
}
