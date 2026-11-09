import { Component, ElementRef, computed, effect, inject, input, output, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Orden } from '../../../cajera/ordenes/ordenes.service';
import { formatearHora } from '../../../compartido/formato';
import { iniciales } from '../../../sistema/navegacion';
import { diaMes } from '../../por-cotizar/existencia';
import { accionOrden, estadoOrden } from '../estado-orden';
import { Conversacion, MensajesService } from '../mensajes.service';
import { RedactarComponent } from '../redactar/redactar.component';

/** J11.1 / J11.2 / J11.4 · Conversación con el cliente: mensajes, respuestas rápidas, estado compartido y foto del avance. */
@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [RouterLink, RedactarComponent],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css',
})
export class ChatComponent {
  protected readonly servicio = inject(MensajesService);

  readonly conversacion = input.required<Conversacion>();
  readonly orden = input<Orden | null>(null);
  readonly volver = output<void>();

  private readonly lista = viewChild<ElementRef<HTMLElement>>('lista');

  protected readonly nombre = computed(() => this.conversacion().cliente.split(' ')[0]);
  protected readonly iniciales = computed(() => iniciales(this.conversacion().cliente));
  protected readonly estado = computed(() => (this.orden() ? estadoOrden(this.orden()!) : null));
  protected readonly accion = computed(() => (this.orden() ? accionOrden(this.orden()!) : null));

  protected readonly subtitulo = computed(() => {
    const o = this.orden();
    const partes = [`Folio ${this.conversacion().folio}`];
    if (o) partes.push(o.equipo, this.estado()!.texto.split(' · ')[0], `revisó ${o.tecnico.nombre}`);
    return partes.join(' · ');
  });

  /** Mensajes con el separador de día ("Hoy · 8 nov") donde cambia la fecha. */
  protected readonly renglones = computed(() => {
    let dia = '';
    return this.conversacion().mensajes.map((m) => {
      const d = new Date(m.fecha).toDateString();
      const separador = d !== dia ? etiquetaDia(m.fecha) : null;
      dia = d;
      return { ...m, separador, hora: formatearHora(new Date(m.fecha)) };
    });
  });

  constructor() {
    // Siempre se ve lo último, como en cualquier chat.
    effect(() => {
      this.conversacion();
      const el = this.lista()?.nativeElement;
      if (el) queueMicrotask(() => (el.scrollTop = el.scrollHeight));
    });
  }

  protected enviar(texto: string): void {
    this.servicio.enviar(this.conversacion().folio, { de: 'jefe', texto });
  }

  /** Comparte en el chat el estado de la orden (el mismo que ve el cliente en su portal). */
  protected compartirEstado(): void {
    const e = this.estado();
    if (e) this.servicio.enviar(this.conversacion().folio, { de: 'estado', texto: e.texto, tono: e.tono });
  }

  protected enviarFoto(): void {
    this.servicio.enviar(this.conversacion().folio, { de: 'foto', texto: 'Foto del avance' });
  }
}

function etiquetaDia(iso: string): string {
  const f = new Date(iso);
  const hoy = new Date();
  if (f.toDateString() === hoy.toDateString()) return `Hoy · ${diaMes(iso)}`;
  if (f.toDateString() === new Date(hoy.getTime() - 86_400_000).toDateString()) return `Ayer · ${diaMes(iso)}`;
  return diaMes(iso);
}
