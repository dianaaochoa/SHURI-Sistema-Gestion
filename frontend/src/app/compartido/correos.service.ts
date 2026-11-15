import { Injectable, signal } from '@angular/core';

export type TipoCorreo = 'acceso' | 'cotizacion' | 'listo' | 'bodega' | 'respuesta';

/** Correo al cliente (Figma P6). El contenido se arma aquí; el envío real lo hará la API con la cuenta de AD9.7. */
export interface Correo {
  id: number;
  tipo: TipoCorreo;
  /** ISO */
  fecha: string;
  para: string;
  folio: string;
  asunto: string;
  titulo: string;
  parrafo: string;
  destacado?: { etiqueta: string; valor: string; nota: string; tono: 'info' | 'exito' | 'advertencia' };
  boton: { texto: string; ruta: string };
}

export const TIPOS_CORREO: Record<TipoCorreo, string> = {
  acceso: 'Acceso al portal',
  cotizacion: 'Cotización lista',
  listo: 'Equipo listo',
  bodega: 'Recordatorio de bodega',
  respuesta: 'Respuesta del chat',
};

/**
 * P6 · Bandeja de correos que se mandan al cliente. Simulado: guarda lo que se enviaría; la API los mandará con la
 * cuenta de Configuración › Correo (AD9.7). No inyecta nada para que órdenes, clientes y mensajes puedan usarlo.
 */
@Injectable({ providedIn: 'root' })
export class CorreosService {
  readonly enviados = signal<Correo[]>([]);
  private consecutivo = 0;

  /** Solo se manda si el cliente tiene correo. */
  enviar(correo: Omit<Correo, 'id' | 'fecha'>): Correo | null {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.para ?? '')) return null;
    const c: Correo = { ...correo, id: ++this.consecutivo, fecha: new Date().toISOString() };
    this.enviados.update((l) => [c, ...l]);
    return c;
  }
}
