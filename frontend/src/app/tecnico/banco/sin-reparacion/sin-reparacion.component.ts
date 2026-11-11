import { Component, HostListener, input, output, signal } from '@angular/core';
import { Orden } from '../../../cajera/ordenes/ordenes.service';
import { FotosComponent } from '../fotos/fotos.component';

const MOTIVOS = [
  { texto: 'Daño en placa irreparable', detalle: 'Corto en la placa principal o procesador dañado' },
  { texto: 'Pieza descontinuada o sin proveedor', detalle: '' },
  { texto: 'Costo mayor al valor del equipo', detalle: '' },
  { texto: 'Otro', detalle: '' },
];

/** T3.7 · Equipo sin reparación: el jefe lo confirma (J3.3) antes de avisar al cliente. */
@Component({
  selector: 'app-sin-reparacion',
  standalone: true,
  imports: [FotosComponent],
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <form class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-sin" (click)="$event.stopPropagation()" (submit)="$event.preventDefault(); mandar()">
        <div class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-sin">Equipo sin reparación · {{ orden().folio }}</h2>
            <p class="modal__subtitulo">{{ orden().cliente.nombre }} · {{ orden().equipo }} · El jefe de técnicos lo confirma antes de avisar al cliente</p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()"><img src="assets/inventario/x.svg" width="20" height="20" alt="" /></button>
        </div>
        <fieldset class="opciones">
          <legend class="campo__etiqueta">Motivo *</legend>
          @for (m of motivos; track m.texto) {
            <label class="opcion-radio" [class.opcion-radio--elegida]="m.texto === motivo()">
              <input type="radio" name="motivo-sin" [checked]="m.texto === motivo()" (change)="motivo.set(m.texto)" />
              <span class="opcion-radio__texto"><strong>{{ m.texto }}</strong>@if (m.detalle) {<span>{{ m.detalle }}</span>}</span>
            </label>
          }
        </fieldset>
        <label class="campo">
          <span class="campo__etiqueta">Explicación para el cliente *</span>
          <textarea class="campo__area" rows="2" placeholder="Lo que verá el cliente en su portal" [class.campo__area--error]="intentado() && !texto().trim()" [value]="texto()" (input)="texto.set($any($event.target).value)"></textarea>
        </label>
        <div class="campo">
          <span class="campo__etiqueta">Evidencia *</span>
          <app-fotos [cantidad]="fotos()" agregar="Foto" (agregada)="fotos.set(fotos() + 1)" />
        </div>
        @if (intentado() && (!texto().trim() || !fotos())) {
          <p class="campo__error">Escribe la explicación y agrega al menos una foto de evidencia.</p>
        }
        <p class="aviso aviso--info"><span class="icono" style="--icono: url(assets/cajera/alert.svg)"></span>El equipo se arma como llegó. Al confirmar el jefe, la orden pasa a “Listo para recoger · sin reparación” y caja cobra solo el diagnóstico, si aplica.</p>
        <div class="modal__acciones">
          <button type="button" class="boton boton--contorno boton--44" (click)="cerrar.emit()">Cancelar</button>
          <button type="submit" class="boton boton--peligro-contorno boton--44"><span class="icono" style="--icono: url(assets/iconos/send.svg)"></span>Enviar al jefe</button>
        </div>
      </form>
    </div>
  `,
  styleUrl: '../modal-banco.css',
})
export class SinReparacionComponent {
  readonly orden = input.required<Orden>();
  readonly cerrar = output<void>();
  readonly enviar = output<{ motivo: string; texto: string }>();

  protected readonly motivos = MOTIVOS;
  protected readonly motivo = signal(MOTIVOS[0].texto);
  protected readonly texto = signal('');
  protected readonly fotos = signal(0);
  protected readonly intentado = signal(false);

  protected mandar(): void {
    this.intentado.set(true);
    if (this.texto().trim() && this.fotos()) this.enviar.emit({ motivo: this.motivo(), texto: this.texto().trim() });
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}
