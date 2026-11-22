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
  /** Pantalla relacionada, relativa al rol (“inventario?vista=entradas”); la abre “Ver todas las notificaciones”. */
  ruta?: string;
}

/**
 * Avisos de prueba por rol mientras no exista la API.
 * Los de la cajera son los de Figma C1.4 y los del técnico los de T1.2.
 */
const DEMO: Record<Rol, Omit<Notificacion, 'id'>[]> = {
  // Figma AD1.2
  administrador: [
    { titulo: 'Ana Martínez pidió restablecer su contraseña', detalle: 'Usuarios y permisos · hace 5 min', leida: false, icono: 'menu/key', tono: 'peligro', ruta: 'usuarios-y-permisos' },
    { titulo: 'Corte con faltante sin revisar', detalle: 'Caja 01 matutino · −$30.00 · hace 1 h', leida: false, icono: 'menu/receipt', tono: 'peligro', ruta: 'cortes-de-caja' },
    { titulo: 'Pago a proveedor vence en 12 días', detalle: 'Distribuidora MovilTec · $4,860.00', leida: false, icono: 'menu/truck', tono: 'advertencia', ruta: 'proveedores' },
    { titulo: 'Quedan 436 timbres', detalle: 'Te avisaremos al llegar a 50', leida: true, icono: 'menu/file', tono: 'info', ruta: 'facturacion' },
  ],
  cajera: [
    { titulo: 'PED-0123 llega hoy', detalle: 'Recíbelo en Inventario › Entrada contra pedido', leida: false, icono: 'menu/truck', tono: 'advertencia', ruta: 'inventario?vista=entradas' },
    { titulo: '#1026 está listo para entregar', detalle: 'Laura Medina · iPhone 11 · se le avisó en su portal', leida: false, icono: 'menu/package-check', tono: 'exito', ruta: 'entrega-de-equipo' },
    { titulo: 'El técnico necesita un dato', detalle: '#1029 · el PIN no funciona · Jorge ya le escribió por chat', leida: false, icono: 'menu/msg', tono: 'advertencia', ruta: 'ordenes-de-servicio?folio=1029' },
    { titulo: 'Cliente aprobó por el portal', detalle: '#1031 · cobra el restante al entregar', leida: true, icono: 'menu/receipt', tono: 'info', ruta: 'ordenes-de-servicio?folio=1031' },
  ],
  // Figma J1.2
  'jefe-tecnicos': [
    { titulo: 'Nuevo mensaje de María Hernández', detalle: '#1024 · “¿Tengo que llevar algo?” · hace 3 min', leida: false, icono: 'menu/msg', tono: 'info', ruta: 'mensajes' },
    { titulo: 'Diagnóstico listo para cotizar', detalle: '#1043 · iPhone 14 · Carlos Ruiz · hace 25 min', leida: false, icono: 'menu/receipt', tono: 'info', ruta: 'por-cotizar?folio=1043' },
    { titulo: 'Cliente aprobó el adicional', detalle: '#1029 · $530.00 · desde el portal', leida: false, icono: 'iconos/circle-check-sm', tono: 'exito', ruta: 'tablero-de-ordenes?folio=1029' },
    { titulo: 'PED-0123 llega hoy', detalle: 'Caja lo recibirá en el mostrador', leida: false, icono: 'menu/truck', tono: 'advertencia', ruta: 'refacciones' },
    { titulo: 'Garantía #0986 por dictaminar', detalle: 'Galaxy S22 Ultra · Carlos recomienda que no aplica', leida: true, icono: 'menu/shield', tono: 'neutro', ruta: 'garantias?folio=0986' },
  ],
  tecnico: [
    { titulo: 'Refacción entregada', detalle: 'Módulo USB-C S21 para #1029', leida: false, icono: 'menu/package', tono: 'exito', ruta: 'banco-de-trabajo?folio=1029' },
    { titulo: 'Cliente aprobó #1031', detalle: 'Galaxy A54 · ya puedes repararlo', leida: false, icono: 'iconos/circle-check-sm', tono: 'exito', ruta: 'banco-de-trabajo?folio=1031' },
    { titulo: 'Caja respondió tu solicitud', detalle: '#1029 · el PIN correcto es 2580', leida: true, icono: 'menu/msg', tono: 'advertencia', ruta: 'banco-de-trabajo?folio=1029' },
    { titulo: 'Jorge te pidió revisar #1024', detalle: 'Garantía · antes de las 13:00', leida: true, icono: 'menu/shield', tono: 'neutro', ruta: 'garantias' },
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
