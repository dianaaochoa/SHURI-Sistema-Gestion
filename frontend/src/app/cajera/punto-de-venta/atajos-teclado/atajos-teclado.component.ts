import { Component, HostListener, output } from '@angular/core';

interface Grupo {
  titulo: string;
  atajos: { accion: string; teclas: string[] }[];
}

/** Contenido de Figma C2.17. */
const COLUMNAS: Grupo[][] = [
  [
    {
      titulo: 'Punto de venta',
      atajos: [
        { accion: 'Buscar producto', teclas: ['F2'] },
        { accion: 'Seleccionar cliente', teclas: ['F4'] },
        { accion: 'Aplicar descuento', teclas: ['F6'] },
        { accion: 'Producto temporal', teclas: ['F7'] },
        { accion: 'Pausar venta', teclas: ['F8'] },
        { accion: 'Ventas en espera', teclas: ['F9'] },
        { accion: 'Cobrar', teclas: ['F12'] },
        { accion: 'Quitar artículo seleccionado', teclas: ['Supr'] },
      ],
    },
  ],
  [
    {
      titulo: 'Navegación',
      atajos: [
        { accion: 'Nueva venta', teclas: ['F1'] },
        { accion: 'Nueva orden de servicio', teclas: ['F3'] },
        { accion: 'Entrega de equipo (fuera del POS)', teclas: ['F4'] },
        { accion: 'Buscar folio', teclas: ['F5'] },
      ],
    },
    {
      titulo: 'En modales y tablas',
      atajos: [
        { accion: 'Confirmar', teclas: ['Enter'] },
        { accion: 'Cancelar o cerrar', teclas: ['Esc'] },
        { accion: 'Moverse entre resultados', teclas: ['↑', '↓'] },
        { accion: 'Reimprimir último ticket', teclas: ['Ctrl', 'P'] },
      ],
    },
  ],
];

/** C2.17 · Atajos de teclado (modal). Se abre con "?" o con "Ver todos los atajos". */
@Component({
  selector: 'app-atajos-teclado',
  standalone: true,
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <section class="modal atajos" role="dialog" aria-modal="true" aria-labelledby="titulo-atajos" (click)="$event.stopPropagation()">
        <header class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-atajos">Atajos de teclado</h2>
            <p class="modal__subtitulo">Funcionan en todas las pantallas de caja · Presiona ? para ver esta ayuda</p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()">
            <img src="assets/pdv/x.svg" width="20" height="20" alt="" />
          </button>
        </header>

        <div class="atajos__columnas">
          @for (columna of columnas; track $index) {
            <div class="atajos__columna">
              @for (grupo of columna; track grupo.titulo) {
                <div class="grupo">
                  <h3 class="grupo__titulo">{{ grupo.titulo }}</h3>
                  @for (atajo of grupo.atajos; track atajo.accion) {
                    <p class="grupo__fila">
                      {{ atajo.accion }}
                      <span class="grupo__teclas">
                        @for (tecla of atajo.teclas; track tecla) {
                          <kbd class="tecla">{{ tecla }}</kbd>
                        }
                      </span>
                    </p>
                  }
                </div>
              }
            </div>
          }
        </div>

        <div class="modal__acciones">
          <button type="button" class="boton boton--primario boton--44" (click)="cerrar.emit()">Entendido</button>
        </div>
      </section>
    </div>
  `,
  styles: `
    .atajos { max-width: 720px; }
    .atajos__columnas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
    .atajos__columna { display: flex; flex-direction: column; gap: 20px; }
    .grupo { display: flex; flex-direction: column; gap: 8px; }
    .grupo__titulo { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #7f97a8; }
    .grupo__fila { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--color-fondo-tenue); font-size: 13px; color: var(--color-texto-secundario); }
    .grupo__teclas { display: flex; gap: 4px; }
    @media (max-width: 640px) {
      .atajos__columnas { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class AtajosTecladoComponent {
  readonly cerrar = output<void>();
  protected readonly columnas = COLUMNAS;

  @HostListener('document:keydown', ['$event'])
  protected alPresionarTecla(evento: KeyboardEvent): void {
    if (evento.key === 'Escape' || evento.key === 'Enter') {
      evento.preventDefault();
      this.cerrar.emit();
    }
  }
}
