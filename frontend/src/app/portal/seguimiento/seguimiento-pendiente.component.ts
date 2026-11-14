import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { PortalService } from '../portal.service';

/** Lugar del seguimiento de la reparación (P2): por ahora muestra el estado y regresa a Mis equipos. */
@Component({
  selector: 'app-seguimiento-pendiente',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="columna">
      <a class="enlace" routerLink="/portal/mis-equipos"><img src="assets/iconos/undo.svg" width="14" height="14" alt="" />Mis equipos</a>
      @if (equipo(); as e) {
        <h1 class="titulo">{{ e.equipo }}</h1>
        <p class="descripcion">{{ e.detalle }}</p>
        <span class="estado estado--{{ e.estado.tono }}">{{ e.estado.texto }}</span>
        <p class="aviso aviso--info">El seguimiento detallado (presupuesto, fotos y avances) se construye en P2.</p>
      } @else {
        <p class="descripcion">No encontramos ese equipo en tu cuenta.</p>
      }
    </main>
  `,
  styleUrls: ['../portal.css'],
  styles: [':host .columna { gap: 12px; } .titulo { text-align: left; } .estado { align-self: flex-start; }'],
})
export class SeguimientoPendienteComponent {
  private readonly portal = inject(PortalService);
  /** Folio sin "#" (de la ruta /portal/equipo/:folio). */
  private readonly folio = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('folio') ?? '')), { initialValue: '' });
  protected readonly equipo = computed(() => this.portal.equipos().find((e) => e.folio.replace('#', '') === this.folio()) ?? null);
}
