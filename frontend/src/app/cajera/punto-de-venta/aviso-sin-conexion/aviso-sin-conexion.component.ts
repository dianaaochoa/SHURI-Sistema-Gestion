import { Component, inject } from '@angular/core';
import { DispositivosService } from '../dispositivos.service';

/** C2.16 · Aviso de venta sin conexión, arriba del ticket. */
@Component({
  selector: 'app-aviso-sin-conexion',
  standalone: true,
  template: `
    <div class="sin-conexion" role="status">
      <img src="assets/pdv/wifi-off.svg" width="20" height="20" alt="" />
      <div class="sin-conexion__texto">
        <p class="sin-conexion__titulo">Sin conexión a internet</p>
        <p>
          Puedes seguir vendiendo en efectivo y tarjeta. Las ventas se guardan en este equipo y se sincronizan solas al reconectar.
          Transferencias, facturas y búsqueda de clientes no están disponibles.
        </p>
      </div>
      <button type="button" class="boton boton--contorno sin-conexion__boton" (click)="dispositivos.reintentarConexion()">
        <img src="assets/pdv/refresh-primario.svg" width="16" height="16" alt="" />Reintentar
      </button>
    </div>
  `,
  styles: `
    .sin-conexion { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 8px; background: var(--color-advertencia-suave); font-size: 12px; color: var(--color-advertencia); }
    .sin-conexion__texto { display: flex; flex: 1; flex-direction: column; gap: 2px; max-width: 820px; }
    .sin-conexion__titulo { font-size: 14px; font-weight: 600; }
    .sin-conexion__boton { flex-shrink: 0; height: 36px; margin-left: auto; padding: 0 14px; }
    @media (max-width: 768px) {
      .sin-conexion { flex-wrap: wrap; align-items: flex-start; }
      .sin-conexion__texto { flex-basis: calc(100% - 32px); }
    }
  `,
})
export class AvisoSinConexionComponent {
  protected readonly dispositivos = inject(DispositivosService);
}
