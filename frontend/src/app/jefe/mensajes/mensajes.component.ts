import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { OrdenesService } from '../../cajera/ordenes/ordenes.service';
import { iniciales } from '../../sistema/navegacion';
import { diaMes } from '../por-cotizar/existencia';
import { ChatComponent } from './chat/chat.component';
import { Conversacion, MensajesService } from './mensajes.service';
import { ResumenOrdenComponent } from './resumen-orden/resumen-orden.component';

type Vista = 'sin-responder' | 'todos' | 'resueltos';

/** J11 · Mensajes de clientes: J11.1 chat · J11.2 respuestas rápidas · J11.3 todo respondido · J11.4 celular · J11.5 no disponible. */
@Component({
  selector: 'app-mensajes',
  standalone: true,
  imports: [ChatComponent, ResumenOrdenComponent],
  templateUrl: './mensajes.component.html',
  styleUrl: './mensajes.component.css',
})
export class MensajesComponent implements OnInit {
  protected readonly servicio = inject(MensajesService);
  private readonly ordenes = inject(OrdenesService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  protected readonly jefe = (inject(AuthService).sesion()?.nombre ?? '').split(' ')[0];

  protected readonly vista = signal<Vista>('sin-responder');
  protected readonly busqueda = signal('');
  protected readonly folio = signal<string | null>(null);
  /** En celular la lista y el chat van en pantallas separadas (J11.4). */
  private readonly movil = matchMedia('(max-width: 768px)').matches;

  protected readonly pestanas = computed(() => [
    { id: 'sin-responder' as Vista, texto: `Sin responder (${this.servicio.sinResponder().length})` },
    { id: 'todos' as Vista, texto: `Todos (${this.servicio.conversaciones().length})` },
    { id: 'resueltos' as Vista, texto: 'Resueltos' },
  ]);

  protected readonly lista = computed(() => {
    const t = this.busqueda().trim().toLowerCase();
    return this.servicio
      .conversaciones()
      .filter((c) => (this.vista() === 'sin-responder' ? this.servicio.pendientes(c) > 0 : this.vista() === 'resueltos' ? c.resuelta : true))
      .filter((c) => !t || `${c.cliente} ${c.folio}`.toLowerCase().includes(t))
      .sort((a, b) => ultimo(b).fecha.localeCompare(ultimo(a).fecha))
      .map((c) => {
        const u = ultimo(c);
        const orden = this.ordenes.ordenes().find((o) => o.folio === c.folio);
        return {
          conversacion: c,
          iniciales: iniciales(c.cliente),
          equipo: orden?.equipo ?? '',
          vista: `${u.de === 'jefe' ? 'Tú: ' : u.de === 'estado' ? 'Estado: ' : u.de === 'foto' ? 'Tú: ' : ''}${u.texto}`,
          cuando: cuando(u.fecha),
          pendientes: this.servicio.pendientes(c),
        };
      });
  });

  protected readonly conversacion = computed(() => this.servicio.conversaciones().find((c) => c.folio === this.folio()) ?? null);
  protected readonly orden = computed(() => this.ordenes.ordenes().find((o) => o.folio === this.folio()) ?? null);

  ngOnInit(): void {
    this.ruta.queryParamMap.subscribe((q) => {
      const folio = q.get('folio');
      if (folio) this.folio.set(`#${folio}`);
      // En escritorio se abre la primera sin responder (Figma J11.1); en celular se ve la lista.
      else this.folio.set(this.movil ? null : (this.servicio.sinResponder()[0]?.folio ?? null));
    });
  }

  protected abrir(c: Conversacion): void {
    this.router.navigate([], { queryParams: { folio: c.folio.replace('#', '') } });
  }

  protected volver(): void {
    this.router.navigate([], { queryParams: {} });
    this.folio.set(null);
  }
}

const ultimo = (c: Conversacion) => c.mensajes[c.mensajes.length - 1];

/** "11:07", "Ayer" o "6 nov" (Figma J11.1). */
function cuando(iso: string): string {
  const f = new Date(iso);
  const hoy = new Date();
  if (f.toDateString() === hoy.toDateString()) return f.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (f.toDateString() === new Date(hoy.getTime() - 86_400_000).toDateString()) return 'Ayer';
  return diaMes(iso);
}
