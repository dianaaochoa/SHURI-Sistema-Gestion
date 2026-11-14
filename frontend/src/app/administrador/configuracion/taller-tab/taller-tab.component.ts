import { Component, inject, signal } from '@angular/core';
import { DESPUES_RESGUARDO, DespuesResguardo, ReglasTaller } from '../../../compartido/reglas-taller';
import { formatearDinero } from '../../../compartido/formato';
import { NivelManoObra } from '../../../jefe/configuracion/configuracion.service';
import { ConfiguracionService } from '../../configuracion.service';

/** AD9.4 · Tabulador y reglas del taller: los mismos de J9 (los puede cambiar el jefe también). */
@Component({
  selector: 'app-taller-tab',
  standalone: true,
  templateUrl: './taller-tab.component.html',
  styleUrls: ['../configuracion.css'],
  styles: ['.agregar { align-self: flex-start; } .t-nivel { font-weight: 600; } .t-ejemplos { white-space: normal; } .derecha { display: flex; flex-direction: column; gap: 16px; } .signo { font-size: 13px; color: var(--color-texto-tenue); }'],
})
export class TallerTabComponent {
  protected readonly s = inject(ConfiguracionService);
  protected readonly niveles = this.s.niveles;
  protected readonly reglas = this.s.reglas;

  protected readonly editando = signal<string | null>(null);
  protected readonly opcionesSla = [12, 24, 48, 72];
  protected readonly opcionesVigencia = [3, 7, 15, 30];
  protected readonly opcionesGarantia = [30, 60, 90];
  protected readonly opcionesSinCobro = [15, 30, 45, 60];
  protected readonly opcionesDespues = Object.entries(DESPUES_RESGUARDO) as [DespuesResguardo, string][];

  protected dinero(n: number): string {
    return formatearDinero(n);
  }

  protected cambiarNivel(id: string, campo: keyof NivelManoObra, valor: string): void {
    this.niveles.update((lista) => lista.map((n) => (n.id === id ? { ...n, [campo]: campo === 'precio' ? Math.max(0, Number(valor) || 0) : valor } : n)));
  }

  protected agregarNivel(): void {
    const id = `nivel-${Date.now()}`;
    this.niveles.update((lista) => [...lista, { id, nivel: 'Nuevo nivel', tiempo: '', ejemplos: '', precio: 0 }]);
    this.editando.set(id);
  }

  protected fijarAlmacenaje(valor: string): void {
    this.regla('almacenajeDia', Math.max(0, Number(valor) || 0));
  }

  protected regla<K extends keyof ReglasTaller>(clave: K, valor: ReglasTaller[K]): void {
    this.reglas.update((r) => ({ ...r, [clave]: valor }));
  }
}
