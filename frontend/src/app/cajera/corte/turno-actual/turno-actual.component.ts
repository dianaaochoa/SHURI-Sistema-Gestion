import { Component, computed, inject, output, signal } from '@angular/core';
import { formatearDinero, formatearHora } from '../../../compartido/formato';
import { CerrarTurnoComponent, CierreTurno } from '../cerrar-turno/cerrar-turno.component';
import { Corte, CorteService, METODO_TEXTO } from '../corte.service';
import { DocumentosService } from '../../documentos/documentos.service';

/** C10.1 · Turno actual: lo que entró y salió, y arqueo de efectivo. */
@Component({
  selector: 'app-turno-actual',
  standalone: true,
  imports: [CerrarTurnoComponent],
  templateUrl: './turno-actual.component.html',
  styleUrl: './turno-actual.component.css',
})
export class TurnoActualComponent {
  private readonly servicio = inject(CorteService);
  private readonly documentos = inject(DocumentosService);
  readonly cerrado = output<Corte>();

  protected readonly r = this.servicio.resumen;
  protected readonly movimientos = this.servicio.movimientos;
  protected readonly metodos = METODO_TEXTO;
  protected readonly hora = (iso: string) => formatearHora(new Date(iso));

  protected dinero(importe: number, entero = false): string {
    const texto = formatearDinero(Math.abs(importe), entero);
    return importe < 0 ? `−${texto}` : texto;
  }

  /** "1 retiro · 0 pagos a proveedor" (+ ingresos si hubo). */
  protected readonly detalleRetiros = computed(() => {
    const r = this.r();
    const partes = [`${r.numRetiros} ${r.numRetiros === 1 ? 'retiro' : 'retiros'}`, `${r.numPagos} ${r.numPagos === 1 ? 'pago' : 'pagos'} a proveedor`];
    if (r.numIngresos) partes.push(`${r.numIngresos} ${r.numIngresos === 1 ? 'ingreso' : 'ingresos'}`);
    return partes.join(' · ');
  });

  // ---------- Arqueo ----------
  protected readonly contado = signal<number | null>(null);
  protected readonly comentario = signal('');
  protected readonly diferencia = computed(() => (this.contado() === null ? null : Math.round((this.contado()! - this.r().esperado) * 100) / 100));
  protected readonly modal = signal(false);

  protected cerrar(cierre: CierreTurno): void {
    const corte = this.servicio.cerrar(cierre.contado, cierre.comentario, cierre.fondo);
    this.documentos.imprimir({ tipo: 'corte', corte });
    this.modal.set(false);
    this.cerrado.emit(corte);
  }
}
