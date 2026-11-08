import { Component, computed, inject, input, signal } from '@angular/core';
import { formatearDinero, formatearHora } from '../../../compartido/formato';
import { DispositivosService } from '../../punto-de-venta/dispositivos.service';
import { Corte, CorteService, diferencia, estadoCorte } from '../corte.service';

const clave = (iso: string) => {
  const f = new Date(iso);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
};

/** Meses con cortes, del más reciente al más antiguo ("Octubre 2026"). */
export function mesesDeCortes(cortes: Corte[]): { clave: string; texto: string }[] {
  return [...new Set([clave(new Date().toISOString()), ...cortes.map((c) => clave(c.hasta))])]
    .sort()
    .reverse()
    .map((c) => {
      const [anio, mes] = c.split('-').map(Number);
      const nombre = new Date(anio, mes - 1, 1).toLocaleDateString('es-MX', { month: 'long' });
      return { clave: c, texto: `${nombre[0].toUpperCase()}${nombre.slice(1)} ${anio}` };
    });
}

const diaMes = (iso: string) => {
  const f = new Date(iso);
  return `${f.getDate()} ${f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;
};

/** C10.2 · Historial de cortes con su detalle y reimpresión. */
@Component({
  selector: 'app-historial-cortes',
  standalone: true,
  templateUrl: './historial-cortes.component.html',
  styleUrl: './historial-cortes.component.css',
})
export class HistorialCortesComponent {
  private readonly servicio = inject(CorteService);
  private readonly dispositivos = inject(DispositivosService);
  readonly mes = input.required<string>();
  readonly cajera = input('');

  protected readonly diaMes = diaMes;
  protected readonly estado = estadoCorte;
  protected readonly diferencia = diferencia;

  protected readonly lista = computed(() =>
    this.servicio
      .cortes()
      .filter((c) => clave(c.hasta) === this.mes() && (!this.cajera() || c.cajera === this.cajera()))
      .sort((a, b) => b.hasta.localeCompare(a.hasta)),
  );

  protected readonly totales = computed(() => {
    const l = this.lista();
    const difs = l.map(diferencia);
    return {
      cortes: l.length,
      turnos: new Set(l.map((c) => c.turno)).size,
      cajas: [...new Set(l.map((c) => c.caja))].join(', '),
      cobrado: l.reduce((s, c) => s + c.ventas + c.reparaciones, 0),
      diferencia: difs.reduce((s, d) => s + d, 0),
      faltantes: difs.filter((d) => d < 0).length,
      sobrantes: difs.filter((d) => d > 0).length,
      cuadrados: difs.filter((d) => d === 0).length,
    };
  });

  private readonly elegidoFolio = signal<string | null>(null);
  protected readonly elegido = computed<Corte | null>(() => this.lista().find((c) => c.folio === this.elegidoFolio()) ?? this.lista()[0] ?? null);
  protected readonly mensaje = signal<string | null>(null);

  protected elegir(c: Corte): void {
    this.elegidoFolio.set(c.folio);
    this.mensaje.set(null);
    if (window.innerWidth <= 1280) setTimeout(() => document.querySelector('.detalle')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  protected dinero(importe: number, entero = false): string {
    const texto = formatearDinero(Math.abs(importe), entero);
    return importe < 0 ? `−${texto}` : texto;
  }

  protected conSigno(importe: number): string {
    return importe > 0 ? `+${this.dinero(importe)}` : this.dinero(importe);
  }

  protected horario(c: Corte): string {
    return `${formatearHora(new Date(c.desde))} – ${formatearHora(new Date(c.hasta))}`;
  }

  protected reimprimir(c: Corte): void {
    this.mensaje.set(this.dispositivos.imprimir(c.folio) ? `Corte #${c.folio} impreso` : 'La impresora no responde: revisa que esté encendida, con papel y conectada');
  }
}
