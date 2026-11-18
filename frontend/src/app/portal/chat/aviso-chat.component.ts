import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NEGOCIO } from '../../cajera/documentos/documentos.service';
import { MensajesService } from '../../jefe/mensajes/mensajes.service';
import { PortalService } from '../portal.service';

/** P5.4 · Aviso arriba cuando el jefe contestó y el cliente aún no abre su chat. */
@Component({
  selector: 'app-aviso-chat',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (aviso(); as a) {
      <div class="aviso-chat" role="status">
        <a class="aviso-chat__enlace" [routerLink]="a.ruta">
          <span class="avatar" aria-hidden="true">{{ iniciales }}</span>
          <span class="texto">
            <strong>{{ jefe }} · Jefe de técnicos</strong>
            <span class="mensaje">{{ a.texto }}</span>
            <small>{{ a.cuando }} · Toca para responder</small>
          </span>
        </a>
        <button type="button" class="cerrar" aria-label="Ocultar aviso" (click)="ocultar(a.clave)">×</button>
      </div>
    }
  `,
  styles: [
    `.aviso-chat { position: fixed; top: 8px; left: 50%; z-index: 40; display: flex; width: calc(100% - 24px); max-width: 416px; transform: translateX(-50%); border: 1px solid var(--color-borde); border-radius: 14px; background: var(--color-superficie); box-shadow: 0 8px 24px rgba(23, 55, 78, 0.18); }
    .aviso-chat__enlace { display: flex; flex: 1; gap: 10px; min-width: 0; padding: 12px; color: inherit; text-decoration: none; }
    .avatar { display: grid; width: 36px; height: 36px; flex-shrink: 0; place-items: center; border-radius: 999px; background: var(--color-marino); font-size: 12px; font-weight: 700; color: var(--color-superficie); }
    .texto { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 12px; }
    strong { color: var(--color-marino); }
    .mensaje { display: -webkit-box; overflow: hidden; color: var(--color-texto-secundario); -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    small { font-size: 11px; color: var(--color-primario); }
    .cerrar { align-self: flex-start; padding: 8px 12px; border: 0; background: none; font-size: 18px; line-height: 1; color: var(--color-texto-tenue); cursor: pointer; }`,
  ],
})
export class AvisoChatComponent {
  private readonly portal = inject(PortalService);
  private readonly mensajes = inject(MensajesService);

  protected readonly jefe = NEGOCIO.encargado;
  protected readonly iniciales = NEGOCIO.encargado.split(' ').map((p) => p[0]).join('').slice(0, 2);
  protected readonly ocultos = signal<string[]>([]);

  protected ocultar(clave: string): void {
    this.ocultos.update((l) => [...l, clave]);
  }

  /** El último mensaje del jefe sin leer en alguno de los equipos del cliente. */
  protected readonly aviso = computed(() => {
    const folios = new Set(this.portal.equipos().filter((e) => e.orden).map((e) => e.folio));
    const sinLeer = this.mensajes
      .conversaciones()
      .filter((c) => folios.has(c.folio))
      .flatMap((c) => c.mensajes.filter((m) => m.de === 'jefe' && !m.leido).map((m) => ({ folio: c.folio, m })))
      .sort((a, b) => b.m.fecha.localeCompare(a.m.fecha))[0];
    if (!sinLeer) return null;
    const clave = `${sinLeer.folio}-${sinLeer.m.fecha}`;
    if (this.ocultos().includes(clave)) return null;
    const min = Math.round((Date.now() - new Date(sinLeer.m.fecha).getTime()) / 60_000);
    return { clave, texto: sinLeer.m.texto, ruta: `/portal/chat/${sinLeer.folio.replace('#', '')}`, cuando: min < 1 ? 'Ahora' : min < 60 ? `Hace ${min} min` : 'Hoy' };
  });
}
