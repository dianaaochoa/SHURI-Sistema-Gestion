import { Component, HostListener, computed, input, output } from '@angular/core';
import { formatearDinero } from '../../../compartido/formato';
import { Orden } from '../ordenes.service';

/** Día hábil siguiente a las 18:00 (diagnóstico estimado de C5.3). */
function diagnosticoEstimado(iso: string): string {
  const fecha = new Date(iso);
  fecha.setDate(fecha.getDate() + 1);
  if (fecha.getDay() === 0) fecha.setDate(fecha.getDate() + 1);
  const mes = fecha.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');
  return `${fecha.getDate()} ${mes} antes de las 18:00`;
}

/** C5.3 · Orden registrada (confirmación). */
@Component({
  selector: 'app-orden-registrada',
  standalone: true,
  template: `
    <div class="modal-fondo" (click)="verEnOrdenes.emit()">
      <section class="modal registrada" role="alertdialog" aria-modal="true" aria-labelledby="titulo-registrada" (click)="$event.stopPropagation()">
        <span class="registrada__icono"><img src="assets/ordenes/circulo-check-exito.svg" width="32" height="32" alt="" /></span>
        <h2 class="registrada__titulo" id="titulo-registrada">Orden {{ orden().folio }} registrada</h2>
        <p class="registrada__subtitulo">{{ orden().cliente.nombre }} · {{ orden().equipo }} · {{ anticipoTexto() }}</p>

        <div class="datos">
          <p class="datos__fila"><span>Técnico asignado</span><strong>{{ orden().tecnico.nombre }}</strong></p>
          <p class="datos__fila"><span>Diagnóstico estimado</span><strong>{{ estimado() }}</strong></p>
          <p class="datos__fila"><span>Usuario del portal</span><strong>{{ orden().cliente.correo || orden().cliente.telefono }}</strong></p>
          <p class="datos__fila"><span>Contraseña temporal</span><strong>{{ contrasena() }}</strong></p>
        </div>

        <div class="impresion">
          <p class="impresion__titulo">{{ impreso() ? 'Se imprimió:' : 'No se pudo imprimir:' }}</p>
          <label class="casilla"><input type="checkbox" [checked]="impreso()" disabled />Orden de servicio (hoja carta) · 2 copias</label>
          <label class="casilla"><input type="checkbox" [checked]="impreso()" disabled />Ticket térmico de recepción</label>
        </div>

        <div class="registrada__acciones">
          <button type="button" class="boton boton--contorno boton--44" (click)="reimprimir.emit()">
            <img src="assets/ventas/printer-primario.svg" width="16" height="16" alt="" />Reimprimir
          </button>
          <button type="button" class="boton boton--contorno boton--44" [disabled]="!orden().cliente.correo" (click)="reenviar.emit()">
            <img src="assets/pdv/send-primario.svg" width="16" height="16" alt="" />Reenviar por correo
          </button>
          <button type="button" class="boton boton--contorno boton--44" (click)="verEnOrdenes.emit()">Ver en Órdenes</button>
          <button type="button" class="boton boton--primario boton--44" (click)="otra.emit()">
            <img src="assets/pdv/plus-blanco.svg" width="16" height="16" alt="" />Registrar otra orden
          </button>
        </div>
      </section>
    </div>
  `,
  styles: `
    .registrada { align-items: center; max-width: 560px; text-align: center; }
    .registrada__icono { display: flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 999px; background: var(--color-exito-suave); }
    .registrada__titulo { font-size: 20px; font-weight: 700; color: var(--color-marino); }
    .registrada__subtitulo { font-size: 13px; color: var(--color-texto-tenue); }
    .datos { display: flex; flex-direction: column; gap: 8px; width: 100%; padding: 12px 16px; border-radius: 8px; background: var(--color-fondo); }
    .datos__fila { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--color-texto-tenue); }
    .datos__fila strong { font-weight: 600; text-align: right; color: var(--color-marino); }
    .impresion { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; width: 100%; }
    .impresion__titulo { font-size: 12px; font-weight: 600; color: var(--color-texto-secundario); }
    .impresion .casilla { cursor: default; }
    .registrada__acciones { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; width: 100%; }
    .registrada__acciones .boton { padding: 0 12px; white-space: nowrap; }
    @media (max-width: 480px) {
      .registrada__acciones { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class OrdenRegistradaComponent {
  readonly orden = input.required<Orden>();
  readonly contrasena = input.required<string>();
  readonly metodoAnticipo = input('Efectivo');
  readonly impreso = input(true);
  readonly reimprimir = output<void>();
  readonly reenviar = output<void>();
  readonly verEnOrdenes = output<void>();
  readonly otra = output<void>();

  protected readonly estimado = computed(() => diagnosticoEstimado(this.orden().recibido));
  protected readonly anticipoTexto = computed(() => {
    const anticipo = this.orden().anticipo;
    return anticipo > 0 ? `Anticipo ${formatearDinero(anticipo)} en ${this.metodoAnticipo().toLowerCase()}` : 'Sin anticipo';
  });

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    this.verEnOrdenes.emit();
  }
}
