import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../../acceso/auth.service';
import { CajaService } from '../../cajera/caja.service';
import { formatearFechaLarga, saludoDelDia } from '../../compartido/formato';
import { NAVEGACION } from '../navegacion';

/** `data` que cada ruta del menú le pasa a esta página (ver app.routes.ts). */
interface DatosPagina {
  titulo: string;
  figma: string;
}

/**
 * Lugar de cada pantalla que aún no se construye.
 * Muestra su título y la clave de Figma que le corresponde; se reemplaza pantalla por pantalla.
 */
@Component({
  selector: 'app-pagina-pendiente',
  standalone: true,
  template: `
    <header class="encabezado-pagina">
      <div>
        <h1 class="encabezado-pagina__titulo">{{ esInicio() ? saludo() : datos().titulo }}</h1>
        <p class="encabezado-pagina__subtitulo">{{ fecha }} · {{ resumen() }} · SHURI</p>
      </div>
    </header>

    <section class="pendiente">
      <p class="pendiente__clave">Figma · {{ datos().figma }}</p>
      <p class="pendiente__texto">
        Esta pantalla todavía no está construida. El menú, el usuario y las notificaciones ya funcionan.
      </p>
    </section>
  `,
  styles: `
    .pendiente {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
      min-height: 320px; margin-top: 24px; padding: 32px;
      background: var(--color-superficie); border: 1px dashed var(--color-borde); border-radius: 12px;
      text-align: center;
    }
    .pendiente__clave {
      padding: 4px 10px; border-radius: 999px; background: var(--color-primario-suave);
      font-size: 12px; font-weight: 600; color: var(--color-primario);
    }
    .pendiente__texto { max-width: 420px; font-size: 13px; line-height: 19px; color: var(--color-texto-tenue); }
  `,
})
export class PaginaPendienteComponent {
  private readonly sesion = inject(AuthService).sesion;
  protected readonly datos = toSignal(inject(ActivatedRoute).data as Observable<DatosPagina>, {
    initialValue: { titulo: '', figma: '' },
  });

  protected readonly esInicio = computed(() => this.datos().titulo === 'Inicio');
  private readonly caja = inject(CajaService);
  protected readonly resumen = computed(() =>
    this.sesion()?.rol === 'cajera' ? this.caja.resumen() : NAVEGACION[this.sesion()?.rol ?? 'cajera'].resumen,
  );
  protected readonly saludo = computed(
    () => `${saludoDelDia(new Date())}, ${this.sesion()?.nombre.split(' ')[0] ?? ''}`,
  );

  protected readonly fecha = formatearFechaLarga(new Date());
}
