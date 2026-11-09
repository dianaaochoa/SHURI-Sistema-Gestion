import { Component, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MensajesService, RespuestaRapida } from '../mensajes.service';

/** J11.1 / J11.2 / J11.4 · Escribir: respuestas rápidas, compartir estado, foto del avance y el mensaje. */
@Component({
  selector: 'app-redactar',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './redactar.component.html',
  styleUrl: './redactar.component.css',
})
export class RedactarComponent {
  protected readonly servicio = inject(MensajesService);

  readonly nombre = input.required<string>();
  readonly puedeCompartir = input(false);
  readonly enviar = output<string>();
  readonly compartir = output<void>();
  readonly foto = output<void>();

  protected readonly texto = signal('');
  protected readonly rapidasAbiertas = signal(false);

  protected mandar(): void {
    const texto = this.texto().trim();
    if (!texto) return;
    this.enviar.emit(texto);
    this.texto.set('');
  }

  protected usarRapida(r: RespuestaRapida): void {
    this.texto.set(r.texto);
    this.rapidasAbiertas.set(false);
  }

  protected alTeclear(evento: KeyboardEvent): void {
    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault();
      this.mandar();
    }
  }
}
