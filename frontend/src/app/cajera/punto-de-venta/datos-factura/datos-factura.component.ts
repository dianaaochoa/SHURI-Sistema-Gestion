import { AfterViewInit, Component, ElementRef, HostListener, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { formatearDinero } from '../../../compartido/formato';
import { Cliente, DatosFiscales, PUBLICO_GENERAL, REGIMENES_FISCALES, USOS_CFDI } from '../clientes.datos';

const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Campo = 'rfc' | 'codigoPostal' | 'razonSocial' | 'correo';

/** C2.18 · Datos de facturación (modal sobre "Cobrar venta"). */
@Component({
  selector: 'app-datos-factura',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <section class="modal factura" role="dialog" aria-modal="true" aria-labelledby="titulo-factura" (click)="$event.stopPropagation()">
        <header class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-factura">Factura de la venta {{ folio() }}</h2>
            <p class="modal__subtitulo">Total {{ dinero(total()) }} · Se timbra al cobrar y se envía por correo al cliente</p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()">
            <img src="assets/pdv/x.svg" width="20" height="20" alt="" />
          </button>
        </header>

        @if (cliente().fiscal) {
          <p class="aviso aviso--exito">
            <img src="assets/pdv/check-exito.svg" width="16" height="16" alt="" />
            {{ cliente().nombre }} ya tiene datos fiscales guardados. Revisa que sigan vigentes.
          </p>
        } @else if (cliente().id === publico) {
          <p class="aviso aviso--advertencia">
            <img src="assets/cajera/alert.svg" width="16" height="16" alt="" />
            La venta es a Público general: los datos no se guardan. Si es cliente frecuente, selecciónalo antes (F4).
          </p>
        }

        <div class="factura__fila">
          <div class="campo">
            <label class="campo__etiqueta" for="rfc">RFC *</label>
            <div class="campo__control campo__control--40" [class.campo__control--error]="error('rfc')">
              <input id="rfc" class="campo__input" autocomplete="off" maxlength="13" [ngModel]="datos.rfc" (ngModelChange)="datos.rfc = $event.toUpperCase()" />
            </div>
            @if (error('rfc')) {
              <p class="campo__error">Revisa el RFC: 12 o 13 caracteres, como HEMM850312QX4.</p>
            }
          </div>
          <div class="campo">
            <label class="campo__etiqueta" for="cp">Código postal fiscal *</label>
            <div class="campo__control campo__control--40" [class.campo__control--error]="error('codigoPostal')">
              <input id="cp" class="campo__input" inputmode="numeric" autocomplete="off" maxlength="5" [(ngModel)]="datos.codigoPostal" />
            </div>
            @if (error('codigoPostal')) {
              <p class="campo__error">Debe tener 5 dígitos.</p>
            }
          </div>
        </div>

        <div class="campo">
          <label class="campo__etiqueta" for="razon">Nombre o razón social *</label>
          <div class="campo__control campo__control--40" [class.campo__control--error]="error('razonSocial')">
            <input id="razon" class="campo__input" autocomplete="off" [ngModel]="datos.razonSocial" (ngModelChange)="datos.razonSocial = $event.toUpperCase()" />
          </div>
          @if (error('razonSocial')) {
            <p class="campo__error">Escríbelo tal como aparece en la constancia de situación fiscal.</p>
          }
        </div>

        <div class="factura__fila">
          <div class="campo">
            <label class="campo__etiqueta" for="regimen">Régimen fiscal *</label>
            <div class="campo__control campo__control--40">
              <select id="regimen" class="campo__input campo__select" [(ngModel)]="datos.regimen">
                @for (r of regimenes; track r.clave) {
                  <option [value]="r.clave">{{ r.clave }} · {{ r.nombre }}</option>
                }
              </select>
              <img src="assets/cajera/chev-d.svg" width="16" height="16" alt="" />
            </div>
          </div>
          <div class="campo">
            <label class="campo__etiqueta" for="uso">Uso del CFDI *</label>
            <div class="campo__control campo__control--40">
              <select id="uso" class="campo__input campo__select" [(ngModel)]="datos.usoCfdi">
                @for (u of usos; track u.clave) {
                  <option [value]="u.clave">{{ u.clave }} · {{ u.nombre }}</option>
                }
              </select>
              <img src="assets/cajera/chev-d.svg" width="16" height="16" alt="" />
            </div>
          </div>
        </div>

        <div class="campo">
          <label class="campo__etiqueta" for="correo-factura">Enviar a</label>
          <div class="campo__control campo__control--40" [class.campo__control--error]="error('correo')">
            <input id="correo-factura" class="campo__input" type="email" autocomplete="off" [(ngModel)]="datos.correo" />
          </div>
          @if (error('correo')) {
            <p class="campo__error">Escribe un correo válido para enviar la factura.</p>
          }
        </div>

        <p class="aviso factura__nota">
          <img src="assets/pdv/receipt-primario.svg" width="16" height="16" alt="" />
          Si el cliente no la pide hoy, puede facturar él mismo en shuri.mx/factura con el folio del ticket (dentro del mismo mes).
        </p>

        <div class="modal__acciones">
          <button type="button" class="boton boton--contorno boton--44" (click)="sinFactura.emit()">Sin factura</button>
          <button type="button" class="boton boton--primario boton--44" (click)="enviar()">
            <img src="assets/pdv/check-blanco.svg" width="16" height="16" alt="" />Guardar y facturar
          </button>
        </div>
      </section>
    </div>
  `,
  styles: `
    .factura { max-width: 600px; }
    .factura__fila { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .factura__nota { background: var(--color-primario-suave); }
    .aviso--exito, .aviso--advertencia { align-items: center; }
    @media (max-width: 560px) {
      .factura__fila { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class DatosFacturaComponent implements OnInit, AfterViewInit {
  readonly folio = input.required<string>();
  readonly total = input.required<number>();
  readonly cliente = input.required<Cliente>();
  /** Lo ya capturado en este cobro (si se vuelve a abrir). */
  readonly inicial = input<DatosFiscales | null>(null);

  readonly cerrar = output<void>();
  readonly sinFactura = output<void>();
  readonly guardar = output<DatosFiscales>();

  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly dinero = formatearDinero;
  protected readonly regimenes = REGIMENES_FISCALES;
  protected readonly usos = USOS_CFDI;
  protected readonly publico = PUBLICO_GENERAL.id;
  protected datos: DatosFiscales = { rfc: '', codigoPostal: '', razonSocial: '', regimen: '616', usoCfdi: 'S01', correo: '' };
  private readonly intentado = signal(false);

  private errores(): Record<Campo, boolean> {
    const d = this.datos;
    return {
      rfc: !RFC.test(d.rfc.trim()),
      codigoPostal: !/^\d{5}$/.test(d.codigoPostal.trim()),
      razonSocial: d.razonSocial.trim().length < 3,
      correo: d.correo.trim() !== '' && !CORREO.test(d.correo.trim()),
    };
  }

  ngOnInit(): void {
    const c = this.cliente();
    this.datos = { ...(this.inicial() ?? c.fiscal ?? { ...this.datos, correo: c.correo ?? '' }) };
  }

  ngAfterViewInit(): void {
    // ngModel escribe los valores un ciclo después: se espera para enfocar el primer campo vacío.
    setTimeout(() => {
      const campos = this.elemento.nativeElement.querySelectorAll<HTMLInputElement>('input');
      (Array.from(campos).find((campo) => !campo.value) ?? campos[0])?.focus();
    });
  }

  protected error(campo: Campo): boolean {
    return this.intentado() && this.errores()[campo];
  }

  protected enviar(): void {
    this.intentado.set(true);
    if (Object.values(this.errores()).some(Boolean)) return;
    const d = this.datos;
    this.guardar.emit({ ...d, rfc: d.rfc.trim(), codigoPostal: d.codigoPostal.trim(), razonSocial: d.razonSocial.trim(), correo: d.correo.trim() });
  }

  @HostListener('document:keydown', ['$event'])
  protected alPresionarTecla(evento: KeyboardEvent): void {
    if (evento.key === 'Escape') this.cerrar.emit();
    if (evento.key === 'Enter' && (evento.target as HTMLElement).tagName === 'INPUT') {
      evento.preventDefault();
      this.enviar();
    }
  }
}
