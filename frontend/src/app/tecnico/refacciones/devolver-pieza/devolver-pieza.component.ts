import { Component, HostListener, inject, input, output, signal } from '@angular/core';
import { OrdenesService } from '../../../cajera/ordenes/ordenes.service';
import { EstadoPieza, Solicitud } from '../../../jefe/refacciones/refacciones.service';

/** Cómo la describe el técnico (Figma T5.3); el jefe la confirma en J5.3. */
const OPCIONES: { id: EstadoPieza; texto: string; detalle: string }[] = [
  { id: 'nueva', texto: 'Nueva, sin abrir', detalle: 'Regresa al inventario disponible' },
  { id: 'abierta', texto: 'Abierta, sin instalar', detalle: 'Regresa como “abierta”; el jefe la revisa' },
  { id: 'danada', texto: 'Dañada o defectuosa', detalle: 'No regresa al stock; se reporta al proveedor' },
];

/** T5.3 · Devolver una pieza que no se usó. */
@Component({
  selector: 'app-devolver-pieza',
  standalone: true,
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <form class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-devolver" (click)="$event.stopPropagation()" (submit)="$event.preventDefault(); devolver.emit({ estado: estado(), nota: nota() })">
        <div class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-devolver">Devolver refacción · {{ solicitud().id }}</h2>
            <p class="modal__subtitulo">{{ solicitud().nombre }} · Orden {{ solicitud().orden }} · {{ motivo() }}</p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()"><img src="assets/inventario/x.svg" width="20" height="20" alt="" /></button>
        </div>
        <fieldset class="opciones">
          <legend class="campo__etiqueta">¿En qué estado regresa? *</legend>
          @for (o of opciones; track o.id) {
            <label class="opcion-radio" [class.opcion-radio--elegida]="o.id === estado()">
              <input type="radio" name="estado-pieza" [checked]="o.id === estado()" (change)="estado.set(o.id)" />
              <span class="opcion-radio__texto"><strong>{{ o.texto }}</strong><span>{{ o.detalle }}</span></span>
            </label>
          }
        </fieldset>
        <label class="campo">
          <span class="campo__etiqueta">Nota</span>
          <span class="campo__control campo__control--40">
            <input class="campo__input" placeholder="Ej. empaque original cerrado" [value]="nota()" (input)="nota.set($any($event.target).value)" />
          </span>
        </label>
        <p class="aviso aviso--info"><span class="icono" style="--icono: url(assets/cajera/alert.svg)"></span>El jefe de técnicos confirma la recepción de la pieza.</p>
        <div class="modal__acciones">
          <button type="button" class="boton boton--contorno boton--44" (click)="cerrar.emit()">Cancelar</button>
          <button type="submit" class="boton boton--primario boton--44"><span class="icono" style="--icono: url(assets/iconos/undo.svg)"></span>Devolver pieza</button>
        </div>
      </form>
    </div>
  `,
  styleUrl: '../../banco/modal-banco.css',
})
export class DevolverPiezaComponent {
  private readonly ordenes = inject(OrdenesService).ordenes;

  readonly solicitud = input.required<Solicitud>();
  readonly cerrar = output<void>();
  readonly devolver = output<{ estado: EstadoPieza; nota: string }>();

  protected readonly opciones = OPCIONES;
  protected readonly estado = signal<EstadoPieza>('nueva');
  protected readonly nota = signal('');

  /** "el cliente rechazó la reparación" o "el equipo no tuvo reparación" */
  protected motivo(): string {
    const o = this.ordenes().find((x) => x.folio === this.solicitud().orden);
    return o?.rechazo ? 'el cliente rechazó la reparación' : 'el equipo no tuvo reparación';
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}
