import { Component, computed, inject, signal } from '@angular/core';
import { ConfiguracionService, MensajeAuto, VARIABLES_MENSAJE } from '../../configuracion.service';

/** Datos de ejemplo de la vista previa (Figma AD9.6). */
const EJEMPLO: Record<string, string> = { '{cliente}': 'Laura', '{equipo}': 'iPhone 11', '{folio}': '#1026', '{restante}': '$650.00', '{enlace}': 'shuri.mx/1026' };

/** AD9.6 · Mensajes automáticos al cliente: por qué medio llega cada uno y su texto. */
@Component({
  selector: 'app-mensajes-tab',
  standalone: true,
  templateUrl: './mensajes-tab.component.html',
  styleUrls: ['../configuracion.css', './mensajes-tab.component.css'],
})
export class MensajesTabComponent {
  protected readonly s = inject(ConfiguracionService);
  protected readonly c = this.s.borrador;
  protected readonly variables = VARIABLES_MENSAJE;
  protected readonly elegido = signal('listo');

  protected readonly mensaje = computed(() => this.c().mensajes.find((m) => m.id === this.elegido()) ?? this.c().mensajes[0]);

  protected readonly vista = computed(() => {
    const m = this.mensaje();
    const negocio = this.c().negocio.nombre.split(' · ')[0].trim();
    const texto = m.texto.replace(/\{(cliente|equipo|folio|restante|enlace|negocio)\}/g, (v) => (v === '{negocio}' ? negocio : EJEMPLO[v]));
    const medios = [m.portal ? 'Portal' : '', m.correo ? 'correo' : ''].filter(Boolean).join(' y ');
    return { texto, medios: m.activo ? medios || 'Sin medio' : 'Desactivado', faltan: VARIABLES_MENSAJE.filter((v) => !m.texto.includes(v) && v === '{enlace}') };
  });

  protected cambiar(id: string, campo: keyof MensajeAuto, valor: boolean | string): void {
    this.s.cambiar('mensajes', this.c().mensajes.map((m) => (m.id === id ? { ...m, [campo]: valor } : m)));
  }

  /** Inserta la variable donde está el cursor del texto. */
  protected insertar(area: HTMLTextAreaElement, variable: string): void {
    const inicio = area.selectionStart ?? area.value.length;
    const fin = area.selectionEnd ?? inicio;
    const nuevo = area.value.slice(0, inicio) + variable + area.value.slice(fin);
    this.cambiar(this.mensaje().id, 'texto', nuevo);
    queueMicrotask(() => {
      area.focus();
      area.setSelectionRange(inicio + variable.length, inicio + variable.length);
    });
  }
}
