import { Component, computed, inject, signal } from '@angular/core';
import { CajaService } from '../../../cajera/caja.service';
import { formatearDinero } from '../../../compartido/formato';
import { BANCOS, CajaConfig, ConfiguracionService } from '../../configuracion.service';

/** AD9.2 · Cajas, formas de pago y datos para transferencias. */
@Component({
  selector: 'app-cajas-tab',
  standalone: true,
  templateUrl: './cajas-tab.component.html',
  styleUrls: ['../configuracion.css'],
  styles: ['.agregar { align-self: flex-start; } .clabe { font-family: monospace; letter-spacing: 1px; } .comision { width: 90px; }'],
})
export class CajasTabComponent {
  protected readonly s = inject(ConfiguracionService);
  private readonly caja = inject(CajaService);

  protected readonly c = this.s.borrador;
  protected readonly bancos = BANCOS;
  /** Caja que se está editando en la tabla. */
  protected readonly editando = signal<number | null>(null);
  /** La CLABE se ve tapada hasta que se escribe otra. */
  protected readonly cambiandoClabe = signal(false);

  protected readonly filas = computed(() =>
    this.c().cajas.map((k, i) => {
      const t = this.caja.turnoDeCaja();
      const abierta = !!t && t.caja === k.nombre;
      return { k, i, fondo: formatearDinero(k.fondo), estado: abierta ? { texto: `Abierta · ${t!.turno.toLowerCase()}${t!.cajera ? ` · ${t!.cajera}` : ''}`, tono: 'exito' } : { texto: 'Cerrada', tono: 'neutro' } };
    }),
  );

  protected readonly clabeTapada = computed(() => `•••• •••• •••• ${this.c().transferencia.clabe.slice(-4)}`);
  protected readonly clabeValida = computed(() => /^\d{18}$/.test(this.c().transferencia.clabe));

  protected cambiarCaja(i: number, campo: keyof CajaConfig, valor: string): void {
    const cajas = this.c().cajas.map((k, j) => (j === i ? { ...k, [campo]: campo === 'fondo' ? Math.max(0, Number(valor) || 0) : valor } : k));
    this.s.cambiar('cajas', cajas);
  }

  protected agregarCaja(): void {
    const n = this.c().cajas.length + 1;
    this.s.cambiar('cajas', [...this.c().cajas, { nombre: `Caja ${String(n).padStart(2, '0')}`, ubicacion: '', fondo: 1000, turnos: 'Matutino · Vespertino', terminal: '' }]);
    this.editando.set(n - 1);
  }

  protected escribirClabe(valor: string): void {
    this.s.campo('transferencia', 'clabe', valor.replace(/\D/g, '').slice(0, 18));
  }
}
