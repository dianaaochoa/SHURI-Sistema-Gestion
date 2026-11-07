import { AfterViewInit, Component, ElementRef, HostListener, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Cliente, ESTADOS_MEXICO } from '../../punto-de-venta/clientes.datos';

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAISES = ['México', 'Estados Unidos', 'Otro'];

type Campo = 'nombre' | 'telefono' | 'correo';

/** "8711234567" → "87 1123 4567" (formato de los teléfonos de Figma). */
export function formatearTelefono(texto: string): string {
  const d = texto.replace(/[^0-9]/g, '').slice(-10);
  return d.length === 10 ? `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}` : texto.trim();
}

/** C5.2 · Nuevo cliente (modal sobre la recepción). También sirve para "Editar cliente". */
@Component({
  selector: 'app-nuevo-cliente',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <section class="modal cliente" role="dialog" aria-modal="true" aria-labelledby="titulo-cliente" (click)="$event.stopPropagation()">
        <header class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-cliente">{{ inicial() ? 'Editar cliente' : 'Nuevo cliente' }}</h2>
            <p class="modal__subtitulo">
              @if (inicial()) {
                Los cambios se guardan en su ficha y en esta orden.
              } @else if (busqueda()) {
                No encontramos “{{ busqueda() }}”. Al guardar regresas a la recepción con los datos llenos.
              } @else {
                Al guardar regresas a la recepción con los datos llenos.
              }
            </p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()">
            <img src="assets/pdv/x.svg" width="20" height="20" alt="" />
          </button>
        </header>

        <div class="campo">
          <label class="campo__etiqueta" for="cliente-nombre">Nombre completo *</label>
          <div class="campo__control campo__control--40" [class.campo__control--error]="error('nombre')">
            <input id="cliente-nombre" class="campo__input" autocomplete="off" [(ngModel)]="datos.nombre" />
          </div>
          @if (error('nombre')) {
            <p class="campo__error">Escribe nombre y apellido.</p>
          }
        </div>

        <div class="cliente__fila cliente__fila--2">
          <div class="campo">
            <label class="campo__etiqueta" for="cliente-telefono">Teléfono *</label>
            <div class="campo__control campo__control--40" [class.campo__control--error]="error('telefono')">
              <img src="assets/ordenes/call-gris.svg" width="16" height="16" alt="" />
              <input id="cliente-telefono" class="campo__input" type="tel" inputmode="tel" autocomplete="off" [(ngModel)]="datos.telefono" />
            </div>
            @if (error('telefono')) {
              <p class="campo__error">Debe tener 10 dígitos.</p>
            }
          </div>
          <div class="campo">
            <label class="campo__etiqueta" for="cliente-correo">Correo electrónico *</label>
            <div class="campo__control campo__control--40" [class.campo__control--error]="error('correo')">
              <img src="assets/ordenes/mail-gris.svg" width="16" height="16" alt="" />
              <input id="cliente-correo" class="campo__input" type="email" autocomplete="off" [(ngModel)]="datos.correo" />
            </div>
            @if (error('correo')) {
              <p class="campo__error">Es el usuario de su portal: escribe un correo válido.</p>
            }
          </div>
        </div>

        <div class="cliente__fila cliente__fila--3">
          <div class="campo">
            <label class="campo__etiqueta" for="cliente-pais">País</label>
            <div class="campo__control campo__control--40">
              <select id="cliente-pais" class="campo__input campo__select" [(ngModel)]="direccion.pais">
                @for (p of paises; track p) {
                  <option [value]="p">{{ p }}</option>
                }
              </select>
              <img src="assets/cajera/chev-d.svg" width="16" height="16" alt="" />
            </div>
          </div>
          <div class="campo">
            <label class="campo__etiqueta" for="cliente-estado">Estado</label>
            <div class="campo__control campo__control--40">
              @if (direccion.pais === 'México') {
                <select id="cliente-estado" class="campo__input campo__select" [(ngModel)]="direccion.estado">
                  @for (e of estados; track e) {
                    <option [value]="e">{{ e }}</option>
                  }
                </select>
                <img src="assets/cajera/chev-d.svg" width="16" height="16" alt="" />
              } @else {
                <input id="cliente-estado" class="campo__input" autocomplete="off" [(ngModel)]="direccion.estado" />
              }
            </div>
          </div>
          <div class="campo">
            <label class="campo__etiqueta" for="cliente-ciudad">Ciudad</label>
            <div class="campo__control campo__control--40">
              <input id="cliente-ciudad" class="campo__input" autocomplete="off" [(ngModel)]="direccion.ciudad" />
            </div>
          </div>
        </div>

        <div class="cliente__fila cliente__fila--domicilio">
          <div class="campo">
            <label class="campo__etiqueta" for="cliente-cp">C.P.</label>
            <div class="campo__control campo__control--40">
              <input id="cliente-cp" class="campo__input" inputmode="numeric" maxlength="5" autocomplete="off" [(ngModel)]="direccion.cp" />
            </div>
          </div>
          <div class="campo">
            <label class="campo__etiqueta" for="cliente-calle">Calle</label>
            <div class="campo__control campo__control--40">
              <input id="cliente-calle" class="campo__input" autocomplete="off" [(ngModel)]="direccion.calle" />
            </div>
          </div>
          <div class="campo">
            <label class="campo__etiqueta" for="cliente-exterior">No. exterior</label>
            <div class="campo__control campo__control--40">
              <input id="cliente-exterior" class="campo__input" autocomplete="off" [(ngModel)]="direccion.exterior" />
            </div>
          </div>
          <div class="campo">
            <label class="campo__etiqueta" for="cliente-interior">No. interior</label>
            <div class="campo__control campo__control--40">
              <input id="cliente-interior" class="campo__input" autocomplete="off" [(ngModel)]="direccion.interior" />
            </div>
          </div>
        </div>

        <div class="campo">
          <label class="campo__etiqueta" for="cliente-comentarios">Comentarios</label>
          <textarea id="cliente-comentarios" class="cliente__area" rows="2" [(ngModel)]="comentarios"></textarea>
        </div>

        <footer class="cliente__pie">
          <p class="cliente__ayuda">Enter para guardar · Esc para cancelar</p>
          <div class="modal__acciones">
            <button type="button" class="boton boton--contorno boton--44" (click)="cerrar.emit()">Cancelar</button>
            <button type="button" class="boton boton--primario boton--44" (click)="guardar()">
              <img src="assets/pdv/check-blanco.svg" width="16" height="16" alt="" />Guardar cliente
            </button>
          </div>
        </footer>
      </section>
    </div>
  `,
  styles: `
    .cliente { max-width: 680px; }
    .cliente__fila { display: grid; gap: 12px; }
    .cliente__fila--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .cliente__fila--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .cliente__fila--domicilio { grid-template-columns: 100px minmax(0, 1fr) 110px 110px; }
    .campo__control { gap: 8px; }
    .cliente__area { min-height: 64px; padding: 10px 12px; border: 1px solid var(--color-borde); border-radius: 8px; font: 14px var(--fuente); color: var(--color-marino); resize: vertical; }
    .cliente__area:focus { outline: none; border: 1.5px solid var(--color-primario); }
    .cliente__pie { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
    .cliente__ayuda { font-size: 12px; color: var(--color-texto-tenue); }
    @media (max-width: 640px) {
      .cliente__fila--2, .cliente__fila--3 { grid-template-columns: minmax(0, 1fr); }
      .cliente__fila--domicilio { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .cliente__ayuda { display: none; }
    }
  `,
})
export class NuevoClienteComponent implements OnInit, AfterViewInit {
  /** Cliente a editar; null para uno nuevo. */
  readonly inicial = input<Cliente | null>(null);
  /** Lo que se buscó sin resultados: prellena teléfono, correo o nombre. */
  readonly busqueda = input('');
  readonly cerrar = output<void>();
  readonly guardado = output<Cliente>();

  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly paises = PAISES;
  protected readonly estados = ESTADOS_MEXICO;
  protected datos = { nombre: '', telefono: '', correo: '' };
  protected direccion = { pais: 'México', estado: 'Coahuila', ciudad: 'Torreón', cp: '', calle: '', exterior: '', interior: '' };
  protected comentarios = '';
  private readonly intentado = signal(false);

  ngOnInit(): void {
    const c = this.inicial();
    if (c) {
      this.datos = { nombre: c.nombre, telefono: c.telefono ?? '', correo: c.correo ?? '' };
      if (c.direccion) this.direccion = { ...c.direccion };
      this.comentarios = c.comentarios ?? '';
      return;
    }
    const buscado = this.busqueda().trim();
    if (CORREO.test(buscado)) this.datos.correo = buscado;
    else if (/^[0-9\s()+-]{7,}$/.test(buscado)) this.datos.telefono = formatearTelefono(buscado);
    else this.datos.nombre = buscado;
  }

  ngAfterViewInit(): void {
    // Se enfoca el primer campo vacío (Figma: el cursor ya está en "Nombre completo").
    setTimeout(() => {
      const campos = Array.from(this.elemento.nativeElement.querySelectorAll<HTMLInputElement>('input'));
      (campos.find((c) => !c.value) ?? campos[0])?.focus();
    });
  }

  private errores(): Record<Campo, boolean> {
    return {
      nombre: this.datos.nombre.trim().split(/\s+/).length < 2,
      telefono: this.datos.telefono.replace(/[^0-9]/g, '').length < 10,
      correo: !CORREO.test(this.datos.correo.trim()),
    };
  }

  protected error(campo: Campo): boolean {
    return this.intentado() && this.errores()[campo];
  }

  protected guardar(): void {
    this.intentado.set(true);
    if (Object.values(this.errores()).some(Boolean)) return;
    const base = this.inicial();
    this.guardado.emit({
      ...(base ?? {}),
      id: base?.id ?? `c-${Date.now()}`,
      nombre: this.datos.nombre.trim(),
      telefono: formatearTelefono(this.datos.telefono),
      correo: this.datos.correo.trim(),
      direccion: { ...this.direccion },
      comentarios: this.comentarios.trim() || undefined,
    });
  }

  @HostListener('document:keydown', ['$event'])
  protected alPresionarTecla(evento: KeyboardEvent): void {
    if (evento.key === 'Escape') this.cerrar.emit();
    if (evento.key === 'Enter' && (evento.target as HTMLElement).tagName === 'INPUT') {
      evento.preventDefault();
      this.guardar();
    }
  }
}
