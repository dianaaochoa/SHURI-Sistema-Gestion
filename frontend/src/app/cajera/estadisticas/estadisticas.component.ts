import { Component, computed, inject, signal } from '@angular/core';
import { formatearDinero } from '../../compartido/formato';
import { descargarCsv } from '../inventario/csv';
import { EstadisticasService, Periodo } from './estadisticas.service';
import { GraficaIngresosComponent } from './grafica-ingresos/grafica-ingresos.component';

const PERIODOS: { id: Periodo; texto: string }[] = [
  { id: 'hoy', texto: 'Hoy' },
  { id: 'semana', texto: 'Semana' },
  { id: 'mes', texto: 'Mes' },
  { id: 'anio', texto: 'Año' },
];

const PALABRA: Record<Periodo, string> = { hoy: 'hoy', semana: 'en la semana', mes: 'en el mes', anio: 'en el año' };

/** C9 · Estadísticas: ventas de mostrador y reparaciones por periodo. */
@Component({
  selector: 'app-estadisticas',
  standalone: true,
  imports: [GraficaIngresosComponent],
  templateUrl: './estadisticas.component.html',
  styleUrl: './estadisticas.component.css',
})
export class EstadisticasComponent {
  private readonly servicio = inject(EstadisticasService);

  protected readonly periodos = PERIODOS;
  protected readonly periodo = signal<Periodo>('mes');
  protected readonly datos = computed(() => this.servicio.calcular(this.periodo()));
  protected readonly porEstado = this.servicio.porEstado;
  protected readonly palabra = computed(() => PALABRA[this.periodo()]);

  protected dinero(importe: number, entero = true): string {
    return formatearDinero(importe, entero);
  }

  /** Figma: la barra más larga llega al 90 % del riel. */
  protected readonly maxEstado = computed(() => Math.max(1, ...this.porEstado().map((e) => e.cantidad)));
  protected ancho(cantidad: number): number {
    return (cantidad / (this.maxEstado() * 1.1)) * 100;
  }

  protected exportar(): void {
    const d = this.datos();
    descargarCsv(`estadisticas_${this.periodo()}_${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Estadísticas', d.descripcion],
      [],
      ['Ventas de mostrador', d.mostrador.toFixed(2)],
      ['Ingresos por reparación', d.reparaciones.toFixed(2)],
      ['Equipos entregados', d.entregados],
      ['Ventas', d.ventas],
      ['Ticket promedio', d.ticket.toFixed(2)],
      ['Presupuestos aprobados', `${d.aprobados} de ${d.respondidos}`],
      [],
      [d.grafica.titulo, 'Ventas', 'Reparaciones'],
      ...d.grafica.grupos.filter((g) => !g.futuro).map((g) => [g.etiqueta, g.ventas.toFixed(2), g.reparaciones.toFixed(2)]),
      [],
      ['Producto', 'Piezas', 'Ingresos'],
      ...d.productos.map((p) => [p.nombre, p.piezas, p.ingresos.toFixed(2)]),
      [],
      ['Método de pago', 'Porcentaje', 'Monto'],
      ...d.metodos.map((m) => [m.texto, `${m.porcentaje} %`, m.monto.toFixed(2)]),
      [],
      ['Reparaciones por estado (ahora)', 'Equipos'],
      ...this.porEstado().map((e) => [e.texto, e.cantidad]),
    ]);
  }
}
