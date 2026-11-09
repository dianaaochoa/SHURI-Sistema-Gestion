import { Injectable, computed, signal } from '@angular/core';

/** Un renglón del chat: lo que escribe el cliente desde su portal, lo que contesta el jefe o un estado compartido. */
export interface MensajeChat {
  de: 'cliente' | 'jefe' | 'estado' | 'foto';
  texto: string;
  /** ISO */
  fecha: string;
  /** Mensajes del jefe: el cliente ya lo vio en su portal. */
  leido?: boolean;
  /** Estado compartido (J11.1 "Estado compartido con el cliente"). */
  tono?: string;
}

export interface Conversacion {
  folio: string;
  cliente: string;
  mensajes: MensajeChat[];
  /** El jefe la marcó como resuelta (pasa a "Resueltos"). */
  resuelta: boolean;
}

export interface RespuestaRapida {
  titulo: string;
  texto: string;
}

const haceMin = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString();
const ayer = (hora: string) => {
  const f = new Date(Date.now() - 86_400_000);
  const [h, m] = hora.split(':').map(Number);
  f.setHours(h, m, 0, 0);
  return f.toISOString();
};

/** Figma J11: cinco conversaciones; dos sin responder (María y Andrés). */
const CONVERSACIONES: Conversacion[] = [
  {
    folio: '#1024',
    cliente: 'María Hernández',
    resuelta: false,
    mensajes: [
      { de: 'cliente', texto: 'Hola, ¿ya revisaron mi celular? Sigue sin cargar bien.', fecha: haceMin(8) },
      { de: 'jefe', texto: 'Hola María, soy Jorge, jefe de técnicos. Luis ya cambió el puerto y encontró que el flex de la cámara frontal está roto. Hoy te mando el costo y tú decides.', fecha: haceMin(5), leido: true },
      { de: 'estado', texto: 'En taller · daño adicional por cotizar', fecha: haceMin(5), tono: 'advertencia' },
      { de: 'cliente', texto: 'Gracias. ¿Tengo que llevar algo?', fecha: haceMin(3) },
    ],
  },
  {
    folio: '#1029',
    cliente: 'Andrés Vega',
    resuelta: false,
    mensajes: [
      { de: 'cliente', texto: 'Buenos días', fecha: haceMin(23) },
      { de: 'cliente', texto: '¿Ya revisaron lo del cargo adicional?', fecha: haceMin(22) },
    ],
  },
  {
    folio: '#1026',
    cliente: 'Laura Medina',
    resuelta: false,
    mensajes: [
      { de: 'cliente', texto: '¿Cómo va mi iPhone?', fecha: haceMin(70) },
      { de: 'jefe', texto: 'Ya está listo, puedes pasar hoy.', fecha: haceMin(55), leido: true },
    ],
  },
  {
    folio: '#1043',
    cliente: 'Jorge Salinas',
    resuelta: true,
    mensajes: [
      { de: 'jefe', texto: 'Carlos ya tiene el diagnóstico; hoy te llega la cotización a tu portal.', fecha: ayer('17:40'), leido: true },
      { de: 'cliente', texto: 'Gracias, quedo atento a la cotización', fecha: ayer('17:52') },
    ],
  },
  {
    folio: '#1037',
    cliente: 'Fernanda Ríos',
    resuelta: true,
    mensajes: [
      { de: 'jefe', texto: 'Tu Huawei no tiene reparación; se devuelve como llegó. Puedes pasar cuando gustes.', fecha: ayer('12:10'), leido: true },
      { de: 'cliente', texto: 'Entendido, paso por él el sábado', fecha: ayer('12:30') },
    ],
  },
];

/** Figma J11.2 */
const RAPIDAS: RespuestaRapida[] = [
  { titulo: 'Garantía en revisión', texto: 'Ya tengo el reporte del técnico; hoy te confirmo si aplica la garantía.' },
  { titulo: 'Qué traer', texto: 'No, solo tu folio cuando pases por él. Si aplica la garantía, la reparación no tiene costo.' },
  { titulo: 'Listo para recoger', texto: 'Tu equipo ya está listo. Puedes pasar por él con tu folio e identificación.' },
  { titulo: 'Cotización enviada', texto: 'Te envié la cotización a tu portal; ahí puedes autorizarla o rechazarla.' },
  { titulo: 'Necesitamos un accesorio', texto: '¿Nos puedes traer tu cargador para hacer la prueba de carga?' },
];

/** J11 · Chat con los clientes (desde el botón "Contactar" de su portal). En memoria hasta conectar la API. */
@Injectable({ providedIn: 'root' })
export class MensajesService {
  readonly conversaciones = signal<Conversacion[]>(CONVERSACIONES);
  readonly rapidas = signal<RespuestaRapida[]>(RAPIDAS);
  /** J11.5: con "Disponible hoy" apagado, el portal avisa que se responde mañana. */
  readonly disponible = signal(true);

  /** Mensajes del cliente después de la última respuesta del jefe. */
  pendientes(c: Conversacion): number {
    if (c.resuelta) return 0;
    let n = 0;
    for (let i = c.mensajes.length - 1; i >= 0 && c.mensajes[i].de === 'cliente'; i--) n++;
    return n;
  }

  readonly sinResponder = computed(() => this.conversaciones().filter((c) => this.pendientes(c) > 0));

  private cambiar(folio: string, cambio: (c: Conversacion) => Conversacion): void {
    this.conversaciones.update((lista) => lista.map((c) => (c.folio === folio ? cambio(c) : c)));
  }

  /** El mensaje le llega al cliente en su chat del portal; la conversación deja de estar resuelta si lo estaba. */
  enviar(folio: string, mensaje: Omit<MensajeChat, 'fecha'>): void {
    this.cambiar(folio, (c) => ({ ...c, resuelta: false, mensajes: [...c.mensajes, { ...mensaje, fecha: new Date().toISOString() }] }));
  }

  alternarResuelta(folio: string): void {
    this.cambiar(folio, (c) => ({ ...c, resuelta: !c.resuelta }));
  }

  cambiarRapida(i: number, campo: keyof RespuestaRapida, valor: string): void {
    this.rapidas.update((lista) => lista.map((r, j) => (j === i ? { ...r, [campo]: valor } : r)));
  }
}
