import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NAVEGACION } from '../navegacion';

/** Figma J10: los seis destinos del jefe que van abajo en celular (el resto sigue en el cajón). */
const DESTINOS = [
  { etiqueta: 'Inicio', icono: 'home', ruta: 'inicio' },
  { etiqueta: 'Mensajes', icono: 'msg', ruta: 'mensajes' },
  { etiqueta: 'Tablero', icono: 'list', ruta: 'tablero-de-ordenes' },
  { etiqueta: 'Cotizar', icono: 'receipt', ruta: 'por-cotizar' },
  { etiqueta: 'Garantías', icono: 'shield', ruta: 'garantias' },
  { etiqueta: 'Refacc.', icono: 'package', ruta: 'refacciones' },
];

/** J10 · Barra inferior del jefe de técnicos en celular. */
@Component({
  selector: 'app-navegacion-movil',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="inferior" aria-label="Navegación principal">
      @for (d of destinos; track d.ruta) {
        <a class="destino" [routerLink]="'/jefe/' + d.ruta" routerLinkActive="destino--activo" #rla="routerLinkActive" [attr.aria-current]="rla.isActive ? 'page' : null">
          <span class="destino__icono">
            <span class="icono" [style.--icono]="'url(assets/menu/' + d.icono + '.svg)'"></span>
            @if (insignia(d.ruta); as n) {
              <span class="destino__insignia" [attr.aria-label]="n + ' sin responder'">{{ n }}</span>
            }
          </span>
          <span class="destino__etiqueta">{{ d.etiqueta }}</span>
        </a>
      }
    </nav>
  `,
  styles: `
    :host { display: none; }
    @media (max-width: 768px) {
      :host { position: fixed; right: 0; bottom: 0; left: 0; z-index: 10; display: block; }
    }
    .inferior { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); height: 64px; padding: 0 4px env(safe-area-inset-bottom); border-top: 1px solid var(--color-borde); background: var(--color-superficie); }
    .destino { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-width: 0; font-size: 10px; color: var(--color-texto-tenue); text-decoration: none; }
    .destino--activo { font-weight: 600; color: var(--color-primario); }
    .destino__icono { position: relative; display: flex; }
    .icono { width: 22px; height: 22px; }
    .destino__insignia { position: absolute; top: -5px; right: -8px; display: flex; align-items: center; justify-content: center; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px; background: var(--color-peligro); font-size: 10px; font-weight: 700; color: var(--color-superficie); }
    .destino__etiqueta { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `,
})
export class NavegacionMovilComponent {
  protected readonly destinos = DESTINOS;
  private readonly insignias = new Map(NAVEGACION['jefe-tecnicos'].grupos.flatMap((g) => g.destinos).map((d) => [d.ruta, d.insignia ?? 0]));

  protected insignia(ruta: string): number {
    return this.insignias.get(ruta) ?? 0;
  }
}
