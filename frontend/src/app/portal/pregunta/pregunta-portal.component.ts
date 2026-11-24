import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ElegirPreguntaComponent, GuardarPregunta } from './elegir-pregunta.component';
import { PortalMarcaComponent } from '../compartido/portal-marca.component';
import { PortalPieComponent } from '../compartido/portal-pie.component';
import { PortalService } from '../portal.service';

/**
 * Pregunta de seguridad del cliente (como `PUT /portal/security-question`): sirve para recuperar su contraseña
 * en P1.3. Se ofrece al crear la contraseña (P1.4, `?primera=1`) y desde Mis equipos.
 */
@Component({
  selector: 'app-pregunta-portal',
  standalone: true,
  imports: [RouterLink, ElegirPreguntaComponent, PortalMarcaComponent, PortalPieComponent],
  template: `
    <main class="columna">
      <app-portal-marca />
      <div class="encabezado">
        <h1 class="titulo">Pregunta de seguridad</h1>
        <p class="descripcion">
          @if (primera) {
            Tu contraseña quedó lista. Elige una pregunta de seguridad: si algún día la olvidas, te la haremos para enviarte una temporal a tu correo.
          } @else {
            Si olvidas tu contraseña, te haremos esta pregunta para enviarte una temporal a tu correo.
          }
        </p>
      </div>

      @if (guardada()) {
        <p class="aviso aviso--exito" role="status"><img src="assets/iconos/circle-check-sm.svg" width="14" height="14" alt="" />Pregunta guardada. Te la haremos si olvidas tu contraseña.</p>
        <a class="boton boton--primario boton--bloque" routerLink="/portal/mis-equipos">Ir a Mis equipos</a>
      } @else {
        @if (!primera) {
          <p class="actual"><span>Tu pregunta actual</span>{{ portal.preguntaDelCliente() ?? 'Aún no eliges una.' }}</p>
        }
        <app-elegir-pregunta [guardarCon]="guardar" (guardada)="guardada.set(true)" (cancelado)="salir()" />
      }

      <app-portal-pie />
    </main>
  `,
  styleUrls: ['../portal.css'],
  styles: `
    .actual { display: flex; flex-direction: column; gap: 2px; padding: 12px; border: 1px solid var(--color-borde); border-radius: 8px; font-size: 14px; color: var(--color-marino); }
    .actual span { font-size: 12px; color: var(--color-texto-secundario); }
  `,
})
export class PreguntaPortalComponent {
  protected readonly portal = inject(PortalService);
  private readonly router = inject(Router);
  /** Viene de crear su contraseña (P1.4). */
  protected readonly primera = inject(ActivatedRoute).snapshot.queryParamMap.get('primera') === '1';
  protected readonly guardada = signal(false);
  protected readonly guardar: GuardarPregunta = (clave, respuesta, actual) => this.portal.guardarPregunta(clave, respuesta, actual);

  protected salir(): void {
    this.router.navigateByUrl('/portal/mis-equipos');
  }
}
