import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { AuthService, Rol } from '../acceso/auth.service';

export interface Notificacion {
  id: number;
  titulo: string;
  detalle: string;
  leida: boolean;
}

/**
 * Avisos de prueba por rol mientras no exista la API.
 * Los del técnico son los de Figma (T1.2); los demás siguen el mismo estilo.
 */
const DEMO: Record<Rol, Omit<Notificacion, 'id'>[]> = {
  administrador: [
    { titulo: 'Corte de caja por revisar', detalle: 'Caja 01 · diferencia de -$40 · hace 10 min', leida: false },
    { titulo: 'Factura cancelada', detalle: 'F-0412 · a petición del cliente · hace 1 h', leida: true },
  ],
  cajera: [
    { titulo: 'Orden #1026 lista para entregar', detalle: 'iPhone 11 · Laura Medina · saldo $650', leida: false },
    { titulo: 'Orden #1029 · adicional aprobado', detalle: 'Andrés Vega autorizó $530 adicionales. Hace 5 min', leida: false },
    { titulo: 'Pedido PED-0123 llega hoy', detalle: 'Recíbelo en Inventario › Entrada contra pedido', leida: true },
  ],
  'jefe-tecnicos': [
    { titulo: 'Orden #1043 por cotizar', detalle: 'iPhone 14 · diagnóstico listo · hace 25 min', leida: false },
    { titulo: 'Nuevo mensaje de un cliente', detalle: 'Paola Cruz pregunta por #1031 · hace 12 min', leida: false },
    { titulo: 'Garantía #1024 por dictaminar', detalle: 'Galaxy S22 Ultra · reporte antes de las 13:00', leida: true },
  ],
  tecnico: [
    { titulo: 'Refacción entregada', detalle: 'Módulo USB-C S21 para #1029', leida: false },
    { titulo: 'Cliente aprobó #1031', detalle: 'Galaxy A54 · ya puedes repararlo', leida: false },
    { titulo: 'Caja respondió tu solicitud', detalle: '#1029 · el PIN correcto es 2580', leida: true },
    { titulo: 'Jorge te pidió revisar #1024', detalle: 'Garantía · antes de las 13:00', leida: true },
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
