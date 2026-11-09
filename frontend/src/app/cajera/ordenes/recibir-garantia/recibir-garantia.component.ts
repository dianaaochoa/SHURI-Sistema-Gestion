import { AfterViewInit, Component, ElementRef, HostListener, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Orden, TECNICOS, Tecnico, garantiaRestante, sumarDias } from '../ordenes.service';
import { diaMes } from '../detalle-orden/detalle-orden.component';

export interface RecepcionGarantia {
  falla: string;
  condicion: string;
  accesorios: string;
  tecnico: Tecnico;
  avisar: boolean;
}

/** C4.5 · Recibir equipo en garantía (modal). */
@Component({
  selector: 'app-recibir-garantia',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <section class="modal garantia" role="dialog" aria-modal="true" aria-labelledby="titulo-garantia" (click)="$event.stopPropagation()">
        <header class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-garantia">Recibir equipo en garantía</h2>
            <p class="modal__subtitulo">Mismo folio {{ orden().folio }} · {{ orden().equipo }} · {{ orden().cliente.nombre }}</p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()">
            <img src="assets/pdv/x.svg" width="20" height="20" alt="" />
          </button>
        </header>

        <div class="vigencia">
          <img src="assets/ordenes/escudo-primario.svg" width="20" height="20" alt="" />
          <div>
            <p class="vigencia__titulo">Garantía vigente · {{ dias() }} días restantes (vence {{ vence() }})</p>
            <p class="vigencia__texto">Cubre: {{ cubre() }} realizado el {{ terminado() }}</p>
          </div>
        </div>

        <div class="garantia__fila">
          <div class="campo">
            <label class="campo__etiqueta" for="falla">Falla que reporta el cliente *</label>
            <textarea id="falla" class="campo__area" [class.campo__area--error]="intentado() && !falla.trim()" rows="2" [(ngModel)]="falla"></textarea>
            @if (intentado() && !falla.trim()) {
              <p class="campo__error">Describe la falla que reporta el cliente.</p>
            }
          </div>
          <div class="campo">
            <label class="campo__etiqueta" for="condicion">Condición física al reingresar *</label>
            <textarea id="condicion" class="campo__area" [class.campo__area--error]="intentado() && !condicion.trim()" rows="2" [(ngModel)]="condicion"></textarea>
            @if (intentado() && !condicion.trim()) {
              <p class="campo__error">Anota golpes, humedad o marcas: sirve para saber si la garantía aplica.</p>
            }
          </div>
          <div class="campo">
            <label class="campo__etiqueta" for="accesorios">Accesorios que deja</label>
            <div class="campo__control campo__control--40">
              <input id="accesorios" class="campo__input" autocomplete="off" [(ngModel)]="accesorios" />
            </div>
          </div>
          <div class="campo">
            <label class="campo__etiqueta" for="tecnico">Técnico asignado</label>
            <div class="campo__control campo__control--40">
              <select id="tecnico" class="campo__input campo__select" [(ngModel)]="tecnico">
                @for (t of tecnicos; track t.iniciales) {
                  <option [value]="t.iniciales">{{ t.nombre }} ({{ t.iniciales }}){{ t.iniciales === orden().tecnico.iniciales ? ' · el mismo' : '' }}</option>
                }
              </select>
              <img src="assets/cajera/chev-d.svg" width="16" height="16" alt="" />
            </div>
          </div>
        </div>

        <p class="aviso aviso--advertencia">
          <img src="assets/ventas/alert-advertencia.svg" width="16" height="16" alt="" />
          Si el técnico detecta daño posterior a la entrega (golpe, humedad), se cotiza un costo extra y el cliente lo autoriza en su portal antes de repararlo.
        </p>

        <label class="casilla"><input type="checkbox" [(ngModel)]="avisar" />Avisar al cliente en su portal que su garantía fue recibida</label>

        <div class="modal__acciones">
          <button type="button" class="boton boton--contorno boton--44" (click)="cerrar.emit()">Cancelar</button>
          <button type="button" class="boton boton--primario boton--44" (click)="registrar()">
            <img src="assets/pdv/printer.svg" width="16" height="16" alt="" />Registrar garantía e imprimir comprobante
          </button>
        </div>
      </section>
    </div>
  `,
  styles: `
    .garantia { max-width: 680px; }
    .vigencia { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 8px; background: var(--color-primario-suave); }
    .vigencia__titulo { font-size: 13px; font-weight: 600; color: var(--color-marino); }
    .vigencia__texto { margin-top: 2px; font-size: 12px; color: var(--color-texto-tenue); }
    .garantia__fila { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .campo__area { min-height: 64px; padding: 10px 12px; border: 1px solid var(--color-borde); border-radius: 8px; font: 14px var(--fuente); color: var(--color-marino); resize: vertical; }
    .campo__area:focus { outline: none; border: 1.5px solid var(--color-primario); }
    .campo__area--error, .campo__area--error:focus { border: 1.5px solid var(--color-peligro); }
    .aviso--advertencia { align-items: center; }
    @media (max-width: 640px) {
      .garantia__fila { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class RecibirGarantiaComponent implements OnInit, AfterViewInit {
  readonly orden = input.required<Orden>();
  readonly cerrar = output<void>();
  readonly registrada = output<RecepcionGarantia>();

  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly tecnicos = TECNICOS;
  protected falla = '';
  protected condicion = '';
  protected accesorios = 'Ninguno';
  protected tecnico = '';
  protected avisar = true;
  protected readonly intentado = signal(false);

  protected readonly dias = computed(() => garantiaRestante(this.orden()));
  protected readonly vence = computed(() => diaMes(sumarDias(this.orden().entrega!.fecha, 30)));
  /** "Cambio de pantalla OLED" → "cambio de pantalla OLED" (solo la primera letra). */
  protected readonly cubre = computed(() => {
    const trabajo = this.orden().trabajo;
    return trabajo.charAt(0).toLowerCase() + trabajo.slice(1);
  });
  protected readonly terminado = computed(() => diaMes(this.orden().listaDesde ?? this.orden().entrega!.fecha));

  ngOnInit(): void {
    this.tecnico = this.orden().tecnico.iniciales;
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.elemento.nativeElement.querySelector('textarea')?.focus());
  }

  protected registrar(): void {
    this.intentado.set(true);
    if (!this.falla.trim() || !this.condicion.trim()) return;
    this.registrada.emit({
      falla: this.falla,
      condicion: this.condicion,
      accesorios: this.accesorios,
      tecnico: TECNICOS.find((t) => t.iniciales === this.tecnico) ?? this.orden().tecnico,
      avisar: this.avisar,
    });
  }

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    this.cerrar.emit();
  }
}
