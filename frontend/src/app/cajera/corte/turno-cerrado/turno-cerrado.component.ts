import { Component, computed, inject, input, output, signal } from '@angular/core';
import { formatearDinero, formatearHora } from '../../../compartido/formato';
import { Corte, diferencia } from '../corte.service';
import { DocumentosService } from '../../documentos/documentos.service';

/** C10.5 · Turno cerrado (modal): resumen del corte, reimprimir, abrir otro turno o salir. */
@Component({
  selector: 'app-turno-cerrado',
  standalone: true,
  template: `
    <div class="modal-fondo">
      <section class="modal cerrado" role="dialog" aria-modal="true" aria-labelledby="titulo-cerrado">
        <span class="cerrado__icono"><img src="assets/cajera/lock-grande.svg" width="28" height="28" alt="" /></span>
        <h2 class="modal__titulo" id="titulo-cerrado">Turno cerrado</h2>
        <p class="cerrado__sub">{{ corte().caja }} · {{ corte().cajera }} · {{ horario() }} · Corte #{{ corte().folio }}</p>

        <div class="cuadro">
          <p><span>Total cobrado</span><strong>{{ dinero(corte().ventas + corte().reparaciones) }}</strong></p>
          <p><span>Efectivo entregado a gerencia</span><strong>{{ dinero(corte().contado - corte().fondoQueQueda) }}</strong></p>
          <p><span>Fondo que queda en caja</span><strong>{{ dinero(corte().fondoQueQueda) }}</strong></p>
          <p><span>Diferencia</span><strong [class.falta]="dif() < 0" [class.sobra]="dif() > 0">{{ dif() > 0 ? '+' : dif() < 0 ? '−' : '' }}{{ dinero(dif() < 0 ? -dif() : dif()) }}</strong></p>
        </div>

        <p class="cerrado__nota">{{ mensaje() ?? 'La caja queda bloqueada. Para vender de nuevo hay que abrir un turno.' }}</p>
        <div class="cerrado__botones">
          <button type="button" class="boton boton--contorno boton--44" (click)="reimprimir()">
            <img src="assets/ventas/printer-primario.svg" width="16" height="16" alt="" />Reimprimir corte
          </button>
          <button type="button" class="boton boton--primario boton--44" (click)="abrirTurno.emit()">
            <img src="assets/cajera/unlock-blanco.svg" width="16" height="16" alt="" />Abrir nuevo turno
          </button>
        </div>
        <button type="button" class="enlace" (click)="cerrarSesion.emit()">Cerrar sesión</button>
        <button type="button" class="enlace enlace--tenue" (click)="cerrar.emit()">Ver el corte en el historial</button>
      </section>
    </div>
  `,
  styles: `
    .cerrado { align-items: center; max-width: 520px; text-align: center; }
    .cerrado__icono { display: flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 999px; background: var(--color-neutro-suave); }
    .cerrado__sub { margin-top: -8px; font-size: 13px; color: var(--color-texto-secundario); }
    .cuadro { display: flex; flex-direction: column; gap: 8px; width: 100%; padding: 12px 16px; border-radius: 8px; background: var(--color-fondo); }
    .cuadro p { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--color-texto-tenue); }
    .cuadro strong { font-weight: 600; color: var(--color-marino); }
    .cuadro .falta { color: var(--color-advertencia); }
    .cuadro .sobra { color: var(--color-primario); }
    .cerrado__nota { font-size: 12px; color: var(--color-texto-secundario); }
    .cerrado__botones { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; width: 100%; }
    .enlace--tenue { margin-top: -8px; font-weight: 400; color: var(--color-texto-tenue); }
    @media (max-width: 480px) { .cerrado__botones { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class TurnoCerradoComponent {
  private readonly documentos = inject(DocumentosService);
  readonly corte = input.required<Corte>();
  readonly cerrar = output<void>();
  readonly abrirTurno = output<void>();
  readonly cerrarSesion = output<void>();

  protected readonly mensaje = signal<string | null>(null);
  protected readonly dif = computed(() => diferencia(this.corte()));
  protected readonly horario = computed(() => `${formatearHora(new Date(this.corte().desde))} – ${formatearHora(new Date(this.corte().hasta))}`);

  protected dinero(importe: number): string {
    return formatearDinero(importe);
  }

  protected reimprimir(): void {
    this.mensaje.set(this.documentos.imprimir({ tipo: 'corte', corte: this.corte() }) ? `Corte #${this.corte().folio} impreso de nuevo.` : 'La impresora no responde: revisa que esté encendida, con papel y conectada.');
  }
}
