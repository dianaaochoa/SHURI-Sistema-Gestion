import { Component, input, output } from '@angular/core';

/** C2.14 · Pago con tarjeta rechazado (dentro del modal "Cobrar venta"). */
@Component({
  selector: 'app-tarjeta-rechazada',
  standalone: true,
  template: `
    <div class="rechazo" role="alert">
      <img src="assets/pdv/alert-peligro.svg" width="20" height="20" alt="" />
      <div>
        <p class="rechazo__titulo">La terminal rechazó el pago</p>
        <p>Motivo: {{ motivo() }}. No se realizó ningún cargo.</p>
      </div>
    </div>

    <p class="campo__etiqueta">¿Qué quieres hacer?</p>
    <div class="opciones">
      <button type="button" class="boton boton--primario boton--44" (click)="reintentar.emit()">
        <img src="assets/pdv/refresh-blanco.svg" width="16" height="16" alt="" />Reintentar
      </button>
      <button type="button" class="boton boton--contorno boton--44" (click)="otraTarjeta.emit()">
        <img src="assets/pdv/card-primario.svg" width="16" height="16" alt="" />Otra tarjeta
      </button>
      <button type="button" class="boton boton--contorno boton--44" (click)="cambiarMetodo.emit()">
        <img src="assets/pdv/transfer-primario.svg" width="16" height="16" alt="" />Cambiar método
      </button>
    </div>

    <p class="aviso aviso--info">
      <img src="assets/pdv/alert-primario.svg" width="16" height="16" alt="" />
      Si la terminal sigue sin responder (sin señal o sin papel), cobra en efectivo o transferencia; la venta no se pierde.
    </p>
  `,
  styles: `
    :host { display: contents; }
    .rechazo { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: 8px; background: var(--color-peligro-suave); font-size: 12px; color: var(--color-peligro); }
    .rechazo > div { display: flex; flex-direction: column; gap: 4px; }
    .rechazo__titulo { font-size: 14px; font-weight: 600; }
    .opciones { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .opciones .boton { padding: 0 14px; white-space: nowrap; }
    .aviso--info { background: var(--color-primario-suave); }
    @media (max-width: 560px) {
      .opciones { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class TarjetaRechazadaComponent {
  readonly motivo = input.required<string>();
  readonly reintentar = output<void>();
  readonly otraTarjeta = output<void>();
  readonly cambiarMetodo = output<void>();
}
