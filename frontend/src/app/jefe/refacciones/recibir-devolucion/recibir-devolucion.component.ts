import { Component, computed, inject, input, output, signal } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { Devolucion, ESTADOS_PIEZA, EstadoPieza, RefaccionesService } from '../refacciones.service';

/** J5.3 · Recibir devolución: la pieza que no se usó regresa al stock (o se reporta dañada). */
@Component({
  selector: 'app-recibir-devolucion',
  standalone: true,
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-devolucion" (click)="$event.stopPropagation()" (keydown.escape)="cerrar.emit()">
        <div class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-devolucion">Recibir devolución · {{ devolucion().id }}</h2>
            <p class="modal__subtitulo">{{ devolucion().nombre }} · {{ devolucion().tecnico }} · Orden {{ devolucion().orden }} ({{ devolucion().motivo }})</p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()"><img src="assets/inventario/x.svg" width="20" height="20" alt="" /></button>
        </div>
        <p class="renglon"><span>Estado según {{ devolucion().tecnico.split(' ')[0] }}</span><strong>{{ estados[devolucion().segunTecnico].texto }}</strong></p>
        <fieldset class="opciones">
          <legend class="campo__etiqueta">¿Cómo la recibes? *</legend>
          @for (e of opciones; track e) {
            <label class="opcion-radio" [class.opcion-radio--elegida]="e === estado()">
              <input type="radio" name="estado-pieza" [checked]="e === estado()" (change)="elegido.set(e)" />
              <span class="opcion-radio__texto"><strong>{{ estados[e].texto }}</strong><span>{{ detalle(e) }}</span></span>
            </label>
          }
        </fieldset>
        <div class="modal__acciones">
          <button type="button" class="boton boton--contorno boton--44" (click)="cerrar.emit()">Cancelar</button>
          <button type="button" class="boton boton--primario boton--44" (click)="confirmar()"><img src="assets/inventario/check-14-blanco.svg" width="16" height="16" alt="" />Confirmar recepción</button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .modal { max-width: 520px; }
    .renglon { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--color-texto-tenue); }
    .renglon strong { font-size: 13px; font-weight: 600; color: var(--color-marino); }
    .opciones { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; border: 0; }
    .opciones legend { margin-bottom: 12px; padding: 0; }
  `,
})
export class RecibirDevolucionComponent {
  private readonly servicio = inject(RefaccionesService);
  private readonly jefe = inject(AuthService).sesion()?.nombre ?? '';

  readonly devolucion = input.required<Devolucion>();
  readonly cerrar = output<void>();
  readonly recibida = output<string>();

  protected readonly estados = ESTADOS_PIEZA;
  protected readonly opciones: EstadoPieza[] = ['nueva', 'abierta', 'danada'];
  protected readonly elegido = signal<EstadoPieza | null>(null);
  protected readonly estado = computed(() => this.elegido() ?? this.devolucion().segunTecnico);

  protected detalle(e: EstadoPieza): string {
    return e === 'nueva' ? `${ESTADOS_PIEZA.nueva.detalle} (+${this.devolucion().cantidad})` : ESTADOS_PIEZA[e].detalle;
  }

  protected confirmar(): void {
    const d = this.devolucion();
    this.servicio.recibirDevolucion(d.id, this.estado(), this.jefe);
    this.recibida.emit(
      this.estado() === 'danada'
        ? `${d.id} · ${d.nombre} recibida dañada: no regresa al stock y queda reportada`
        : `${d.id} · ${d.nombre} regresó al inventario (${ESTADOS_PIEZA[this.estado()].texto.toLowerCase()})`,
    );
  }
}
