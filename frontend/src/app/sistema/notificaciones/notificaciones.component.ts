import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { NAVEGACION } from '../navegacion';
import { Notificacion, NotificacionesService, TonoNotificacion } from '../notificaciones.service';

type Filtro = 'todas' | 'nuevas' | TonoNotificacion;

const TONOS: { id: TonoNotificacion; texto: string }[] = [
  { id: 'peligro', texto: 'Urgentes' },
  { id: 'advertencia', texto: 'Pendientes' },
  { id: 'exito', texto: 'Listos' },
  { id: 'info', texto: 'Informativos' },
];

/**
 * “Ver todas las notificaciones” (pie del panel de la campana en Figma, sin pantalla propia):
 * todos los avisos del rol con filtros, marcar como leídos y abrir la pantalla relacionada.
 */
@Component({
  selector: 'app-notificaciones',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="encabezado-pagina">
      <div>
        <h1 class="encabezado-pagina__titulo">Notificaciones</h1>
        <p class="encabezado-pagina__subtitulo">
          {{ servicio.nuevas().length ? servicio.nuevas().length + ' sin leer' : 'Todo leído' }} · avisos de tu rol
        </p>
      </div>
      @if (servicio.nuevas().length) {
        <button type="button" class="boton boton--contorno boton--40" (click)="servicio.marcarTodoLeido()">
          <span class="icono" style="--icono: url(assets/iconos/check.svg)"></span>Marcar todo como leído
        </button>
      }
    </header>

    <nav class="filtros" aria-label="Filtrar notificaciones">
      @for (f of filtros(); track f.id) {
        <button type="button" class="filtro" [class.filtro--activo]="filtro() === f.id" [attr.aria-pressed]="filtro() === f.id" (click)="filtro.set(f.id)">
          {{ f.texto }} <span class="filtro__n">{{ f.n }}</span>
        </button>
      }
    </nav>

    <ul class="panel lista">
      @for (n of visibles(); track n.id) {
        <li class="aviso" [class.aviso--nueva]="!n.leida">
          <span class="aviso__icono" [class]="'aviso__icono aviso__icono--' + n.tono">
            <span class="icono" [style.--icono]="'url(assets/' + n.icono + '.svg)'"></span>
          </span>
          <div class="aviso__texto">
            <p><strong>{{ n.titulo }}</strong>@if (!n.leida) {<span class="estado estado--info aviso__nueva">Nueva</span>}</p>
            <p class="aviso__detalle">{{ n.detalle }}</p>
          </div>
          <div class="aviso__acciones">
            @if (!n.leida) {
              <button type="button" class="enlace" (click)="servicio.marcarLeida(n.id)">Marcar como leída</button>
            }
            @if (n.ruta) {
              <a class="boton boton--contorno boton--32" [routerLink]="'/' + prefijo() + '/' + n.ruta.split('?')[0]" [queryParams]="consulta(n)" (click)="servicio.marcarLeida(n.id)">Abrir</a>
            }
          </div>
        </li>
      } @empty {
        <li class="vacio">
          <span class="icono" style="--icono: url(assets/menu/bell.svg)"></span>
          <p>{{ filtro() === 'nuevas' ? 'No tienes notificaciones sin leer.' : 'No hay notificaciones en este filtro.' }}</p>
        </li>
      }
    </ul>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; }
    .encabezado-pagina .boton .icono { width: 16px; height: 16px; }
    .filtros { display: flex; flex-wrap: wrap; gap: 8px; }
    .filtro { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: 1px solid var(--color-borde); border-radius: 999px; background: var(--color-superficie); font: 500 13px var(--fuente); color: var(--color-texto-secundario); cursor: pointer; }
    .filtro--activo { border-color: var(--color-primario); background: var(--color-primario-suave); color: var(--color-primario); }
    .filtro__n { font-size: 11px; font-weight: 700; }
    .lista { margin: 0; padding: 0; list-style: none; }
    .aviso { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-top: 1px solid var(--color-borde); }
    .aviso:first-child { border-top: 0; }
    .aviso--nueva { background: var(--color-primario-suave); }
    .aviso__icono { display: flex; flex-shrink: 0; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 999px; }
    .aviso__icono .icono { width: 18px; height: 18px; }
    .aviso__icono--exito { background: var(--color-exito-suave); color: var(--color-exito); }
    .aviso__icono--advertencia { background: var(--color-advertencia-suave); color: var(--color-advertencia); }
    .aviso__icono--info { background: var(--color-superficie); color: var(--color-primario); }
    .aviso__icono--peligro { background: var(--color-peligro-suave); color: var(--color-peligro); }
    .aviso__icono--neutro { background: var(--color-neutro-suave); color: var(--color-texto-tenue); }
    .aviso__texto { flex: 1; min-width: 0; font-size: 14px; color: var(--color-marino); }
    .aviso__nueva { margin-left: 8px; vertical-align: middle; }
    .aviso__detalle { margin-top: 2px; font-size: 12px; color: var(--color-texto-secundario); }
    .aviso__acciones { display: flex; flex-shrink: 0; align-items: center; gap: 12px; }
    .vacio { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 40px 16px; font-size: 13px; color: var(--color-texto-tenue); }
    .vacio .icono { width: 28px; height: 28px; }
    @media (max-width: 640px) {
      .aviso { flex-wrap: wrap; }
      .aviso__acciones { width: 100%; justify-content: flex-end; }
    }
  `,
})
export class NotificacionesComponent {
  protected readonly servicio = inject(NotificacionesService);
  private readonly sesion = inject(AuthService).sesion;
  protected readonly prefijo = computed(() => NAVEGACION[this.sesion()?.rol ?? 'cajera'].prefijo);
  protected readonly filtro = signal<Filtro>('todas');

  /** Solo los tonos que tienen avisos, con su cantidad. */
  protected readonly filtros = computed(() => {
    const todas = this.servicio.todas();
    return [
      { id: 'todas' as Filtro, texto: 'Todas', n: todas.length },
      { id: 'nuevas' as Filtro, texto: 'Sin leer', n: this.servicio.nuevas().length },
      ...TONOS.map((t) => ({ id: t.id as Filtro, texto: t.texto, n: todas.filter((x) => x.tono === t.id).length })).filter((f) => f.n),
    ];
  });

  protected readonly visibles = computed(() => {
    const f = this.filtro();
    const todas = this.servicio.todas();
    if (f === 'todas') return todas;
    if (f === 'nuevas') return this.servicio.nuevas();
    return todas.filter((n) => n.tono === f);
  });

  /** "inventario?vista=entradas" → { vista: 'entradas' } */
  protected consulta(n: Notificacion): Record<string, string> | null {
    const q = n.ruta?.split('?')[1];
    if (!q) return null;
    const params: Record<string, string> = {};
    new URLSearchParams(q).forEach((valor, clave) => (params[clave] = valor));
    return params;
  }
}
