import { Injectable, signal } from '@angular/core';
import { AVISOS_CORREO } from './ajustes-documentos';

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

/** Aviso de AD9.6 que controla cada correo (la respuesta del chat no depende de ninguno). */
const AVISO_DE: Record<TipoCorreo, string> = { acceso: 'temporal', cotizacion: 'presupuesto', listo: 'listo', bodega: 'bodega', respuesta: '' };

/**
 * P6 · Bandeja de correos que se mandan al cliente. Simulado: guarda lo que se enviaría; la API los mandará con la
 * cuenta de Configuración › Correo (AD9.7). No inyecta nada para que órdenes, clientes y mensajes puedan usarlo.
 */
@Injectable({ providedIn: 'root' })
export class CorreosService {
  readonly enviados = signal<Correo[]>([]);
  private consecutivo = 0;

  /** Solo se manda si el cliente tiene correo y el aviso tiene “Correo” encendido en AD9.6. */
  enviar(correo: Omit<Correo, 'id' | 'fecha'>): Correo | null {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.para ?? '')) return null;
    if (AVISOS_CORREO[AVISO_DE[correo.tipo]] === false) return null;
    const c: Correo = { ...correo, id: ++this.consecutivo, fecha: new Date().toISOString() };
    this.enviados.update((l) => [c, ...l]);
    return c;
  }
}
