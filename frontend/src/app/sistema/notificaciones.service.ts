import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { AuthService, Rol } from '../acceso/auth.service';

export type TonoNotificacion = 'exito' | 'advertencia' | 'info' | 'peligro' | 'neutro';

export interface Notificacion {
  id: number;
  titulo: string;
  detalle: string;
  leida: boolean;
  /** Ruta del SVG dentro de assets/ (se pinta con el color del tono). */
  icono: string;
  tono: TonoNotificacion;
}

/**
 * Avisos de prueba por rol mientras no exista la API.
 * Los de la cajera son los de Figma C1.4 y los del técnico los de T1.2.
 */
const DEMO: Record<Rol, Omit<Notificacion, 'id'>[]> = {
  administrador: [
    { titulo: 'Corte de caja por revisar', detalle: 'Caja 01 · diferencia de -$40 · hace 10 min', leida: false, icono: 'menu/receipt', tono: 'advertencia' },
    { titulo: 'Factura cancelada', detalle: 'F-0412 · a petición del cliente · hace 1 h', leida: true, icono: 'menu/file', tono: 'neutro' },
  ],
  cajera: [
    { titulo: 'PED-0123 llega hoy', detalle: 'Recíbelo en Inventario › Entrada contra pedido', leida: false, icono: 'menu/truck', tono: 'advertencia' },
    { titulo: '#1026 está listo para entregar', detalle: 'Laura Medina · iPhone 11 · se le avisó en su portal', leida: false, icono: 'menu/package-check', tono: 'exito' },
    { titulo: 'El técnico necesita un dato', detalle: '#1029 · el PIN no funciona · Jorge ya le escribió por chat', leida: false, icono: 'menu/msg', tono: 'advertencia' },
    { titulo: 'Cliente aprobó por el portal', detalle: '#1031 · cobra el restante al entregar', leida: true, icono: 'menu/receipt', tono: 'info' },
  ],
  'jefe-tecnicos': [
    { titulo: 'Orden #1043 por cotizar', detalle: 'iPhone 14 · diagnóstico listo · hace 25 min', leida: false, icono: 'menu/receipt', tono: 'advertencia' },
    { titulo: 'Nuevo mensaje de un cliente', detalle: 'Paola Cruz pregunta por #1031 · hace 12 min', leida: false, icono: 'menu/msg', tono: 'info' },
    { titulo: 'Garantía #1024 por dictaminar', detalle: 'Galaxy S22 Ultra · reporte antes de las 13:00', leida: true, icono: 'menu/shield', tono: 'neutro' },
  ],
  tecnico: [
    { titulo: 'Refacción entregada', detalle: 'Módulo USB-C S21 para #1029', leida: false, icono: 'menu/package', tono: 'exito' },
    { titulo: 'Cliente aprobó #1031', detalle: 'Galaxy A54 · ya puedes repararlo', leida: false, icono: 'iconos/circle-check-sm', tono: 'exito' },
    { titulo: 'Caja respondió tu solicitud', detalle: '#1029 · el PIN correcto es 2580', leida: true, icono: 'menu/msg', tono: 'advertencia' },
    { titulo: 'Jorge te pidió revisar #1024', detalle: 'Garantía · antes de las 13:00', leida: true, icono: 'menu/shield', tono: 'neutro' },
  ],
};

@Injectable({ providedIn: 'root' })
export class NotificacionesService {
  private readonly lista = signal<Notificacion[]>([]);

  readonly todas = this.lista.asReadonly();
  readonly nuevas = computed(() => this.lista().filter((n) => !n.leida));

  constructor() {
    // Cada vez que cambia la sesión se cargan los avisos de ese rol.
    toObservable(inject(AuthService).sesion).subscribe((sesion) =>
      this.lista.set(sesion ? DEMO[sesion.rol].map((n, i) => ({ ...n, id: i + 1 })) : []),
    );
  }

  marcarLeida(id: number): void {
    this.lista.update((lista) => lista.map((n) => (n.id === id ? { ...n, leida: true } : n)));
  }

  marcarTodoLeido(): void {
    this.lista.update((lista) => lista.map((n) => ({ ...n, leida: true })));
  }
}
