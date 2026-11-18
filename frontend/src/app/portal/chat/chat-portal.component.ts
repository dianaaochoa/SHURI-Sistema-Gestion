import { AfterViewChecked, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { NEGOCIO } from '../../cajera/documentos/documentos.service';
import { MensajesService } from '../../jefe/mensajes/mensajes.service';
import { ESTADO_PORTAL, PortalService } from '../portal.service';

const DIA = 86_400_000;
/** Horario del chat (Figma P5.1): lunes a sábado de 9:00 a 19:00. */
const ABRE = 9;
const CIERRA = 19;
export const PREGUNTAS = ['¿Ya revisaron mi equipo?', '¿Cuánto tarda la garantía?', 'Quiero revisar otra falla', 'Cambié mi número de teléfono'];

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
function etiquetaDia(iso: string): string {
  const f = new Date(iso);
  const hoy = new Date();
  const dias = Math.round((new Date(hoy.toDateString()).getTime() - new Date(f.toDateString()).getTime()) / DIA);
  const fecha = `${f.getDate()} ${f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;
  return dias === 0 ? `Hoy · ${fecha}` : dias === 1 ? `Ayer · ${fecha}` : fecha;
}

/** ¿Está en horario? Si no, a qué hora se responde. */
export function enHorario(ahora = new Date()): { abierto: boolean; cuando: string } {
  const dia = ahora.getDay();
  const h = ahora.getHours();
  const abierto = dia !== 0 && h >= ABRE && h < CIERRA;
  const antesDeAbrir = dia !== 0 && h < ABRE;
  const manana = dia === 6 && h >= CIERRA ? 'el lunes' : 'mañana';
  return { abierto, cuando: antesDeAbrir ? `hoy a partir de las ${ABRE}:00` : dia === 0 ? `mañana a partir de las ${ABRE}:00` : `${manana} a partir de las ${ABRE}:00` };
}

/** P5 · Chat con el jefe de técnicos (es la misma conversación que el jefe ve en J11). */
@Component({
  selector: 'app-chat-portal',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './chat-portal.component.html',
  styleUrls: ['./chat-portal.component.css'],
})
export class ChatPortalComponent implements AfterViewChecked {
  private readonly portal = inject(PortalService);
  private readonly mensajes = inject(MensajesService);
  private readonly folio = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('folio') ?? '')), { initialValue: '' });
  private readonly lista = viewChild<ElementRef<HTMLElement>>('lista');
  private ultimoLargo = 0;

  protected readonly jefe = NEGOCIO.encargado;
  protected readonly iniciales = NEGOCIO.encargado.split(' ').map((p) => p[0]).join('').slice(0, 2);
  protected readonly primerNombre = NEGOCIO.encargado.split(' ')[0];
  protected readonly preguntas = PREGUNTAS;
  protected readonly texto = signal('');
  protected readonly horario = enHorario();
  protected readonly disponible = this.mensajes.disponible;

  protected readonly orden = computed(() => this.portal.ordenDe(this.folio()) ?? null);
  protected readonly estado = computed(() => {
    const o = this.orden();
    if (!o) return null;
    if (o.garantia && o.estado === 'en-garantia') return { texto: o.garantia.decision ? 'Dictamen de garantía' : 'Garantía en revisión', tono: 'advertencia' };
    const e = ESTADO_PORTAL[o.estado];
    return { texto: e.texto.split(' · ')[0], tono: e.tono };
  });

  /** Mensajes agrupados por día; los del cliente dicen "Leído" si el jefe ya contestó después. */
  protected readonly dias = computed(() => {
    const o = this.orden();
    const c = o ? this.mensajes.conversaciones().find((x) => x.folio === o.folio) : undefined;
    if (!c) return [];
    const grupos: { dia: string; mensajes: { de: string; texto: string; hora: string; estado: string; tono?: string }[] }[] = [];
    c.mensajes.forEach((m, i) => {
      const dia = etiquetaDia(m.fecha);
      if (grupos.at(-1)?.dia !== dia) grupos.push({ dia, mensajes: [] });
      const contestado = c.mensajes.slice(i + 1).some((x) => x.de !== 'cliente');
      grupos.at(-1)!.mensajes.push({ de: m.de, texto: m.texto, hora: hora(m.fecha), estado: m.de === 'cliente' ? (contestado ? 'Leído' : 'Enviado') : '', tono: m.tono });
    });
    return grupos;
  });

  constructor() {
    // Al abrir el chat, lo que escribió el jefe queda leído (y deja de salir el aviso P5.4).
    effect(
      () => {
        const o = this.orden();
        if (o) this.mensajes.marcarLeidos(o.folio);
      },
      { allowSignalWrites: true },
    );
  }

  ngAfterViewChecked(): void {
    const total = this.dias().reduce((s, d) => s + d.mensajes.length, 0);
    const el = this.lista()?.nativeElement;
    if (el && total !== this.ultimoLargo) {
      this.ultimoLargo = total;
      el.scrollTop = el.scrollHeight;
    }
  }

  protected enviar(texto = this.texto()): void {
    const o = this.orden();
    const t = texto.trim();
    if (!o || !t) return;
    this.mensajes.escribirCliente(o.folio, o.cliente.nombre, t);
    this.texto.set('');
  }

  /** La foto la recibirá la API; aquí se avisa al jefe con su nombre. */
  protected foto(input: HTMLInputElement): void {
    const f = input.files?.[0];
    input.value = '';
    if (f && f.type.startsWith('image/')) this.enviar(`Foto adjunta: ${f.name}`);
  }
}
