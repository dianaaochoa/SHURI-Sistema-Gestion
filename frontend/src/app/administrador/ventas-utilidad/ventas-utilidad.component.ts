import { Component, computed, inject, signal } from '@angular/core';
import { formatearDinero } from '../../compartido/formato';
import { CorteService } from '../../cajera/corte/corte.service';
import { EstadisticasService } from '../../cajera/estadisticas/estadisticas.service';
import { InventarioService } from '../../cajera/inventario/inventario.service';
import { calcularTotales } from '../../cajera/punto-de-venta/venta.service';
import { HistorialVentasService, reembolsado } from '../../cajera/ventas/historial-ventas.service';
import { DESCUENTO_DEMO, porCategoria, utilidadDe } from '../negocio';
import { Mes, dentro, exportarCsv, mesAnterior, ultimosMeses } from '../reportes';

const DIA = 86_400_000;
const dinero = (n: number) => formatearDinero(n, true);
const corto = (f: Date) => `${f.getDate()} ${f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;
const METODOS = [
  { id: 'efectivo', texto: 'Efectivo' },
  { id: 'tarjeta', texto: 'Tarjeta' },
  { id: 'transferencia', texto: 'Transferencia' },
] as const;

/** AD2.1 · Ventas y utilidad del mes (AD2.3: mes sin ventas). */
@Component({
  selector: 'app-ventas-utilidad',
  standalone: true,
  templateUrl: './ventas-utilidad.component.html',
  styleUrls: ['../reportes.css', './ventas-utilidad.component.css'],
})
export class VentasUtilidadComponent {
  private readonly estadisticas = inject(EstadisticasService);
  private readonly inventario = inject(InventarioService);
  private readonly ventas = inject(HistorialVentasService).ventas;
  private readonly cortes = inject(CorteService).cortes;
  private readonly buscar = (sku: string) => this.inventario.buscar(sku);

  protected readonly meses = ultimosMeses();
  protected readonly mesId = signal(this.meses[0].id);
  protected readonly mes = computed<Mes>(() => this.meses.find((m) => m.id === this.mesId())!);

  private readonly datos = computed(() => this.estadisticas.suma(this.mes().desde, this.mes().hasta));
  protected readonly vacio = computed(() => this.datos().ventas + this.datos().entregados === 0 && this.datos().reparaciones === 0);

  /** Ventas reales de la app en el mes (para descuentos, devoluciones y cancelaciones). */
  private readonly ventasMes = computed(() => this.ventas().filter((v) => dentro(v.fecha, this.mes())));

  /** Descuentos: los reales de la app y, en los días del historial de prueba, el 1.7 % de mostrador. */
  private readonly descuentos = computed(() => {
    const reales = this.ventasMes()
      .filter((v) => v.estado !== 'cancelada')
      .reduce((s, v) => s + calcularTotales(v.lineas, v.descuento).descuento * 1.16, 0);
    const ayer = new Date(new Date().setHours(0, 0, 0, 0) - DIA);
    const hasta = this.mes().hasta.getTime() < ayer.getTime() ? this.mes().hasta : ayer;
    const demo = hasta.getTime() >= this.mes().desde.getTime() ? this.estadisticas.suma(this.mes().desde, hasta).mostrador * DESCUENTO_DEMO : 0;
    return reales + demo;
  });

  protected readonly indicadores = computed(() => {
    const d = this.datos();
    const u = utilidadDe(d, this.buscar);
    const antes = mesAnterior(this.mes());
    const a = this.estadisticas.suma(antes.desde, antes.hasta);
    const totalAntes = a.mostrador + a.reparaciones;
    const cambio = totalAntes ? Math.round(((u.ingreso - totalAntes) / totalAntes) * 100) : null;
    const operaciones = d.ventas + d.entregados;
    return [
      { valor: dinero(u.ingreso), tono: '', titulo: 'Ventas del mes', detalle: cambio === null ? 'Sin mes anterior' : `${cambio >= 0 ? '+' : '−'}${Math.abs(cambio)}% vs ${antes.texto.toLowerCase()}` },
      { valor: dinero(u.utilidad), tono: 'exito', titulo: 'Utilidad bruta', detalle: `${u.margen}% de margen` },
      { valor: dinero(operaciones ? u.ingreso / operaciones : 0), tono: 'primario', titulo: 'Ticket promedio', detalle: `${d.ventas} ventas · ${d.entregados} reparaciones` },
      { valor: dinero(this.descuentos()), tono: 'advertencia', titulo: 'Descuentos', detalle: `${u.ingreso ? ((this.descuentos() / u.ingreso) * 100).toFixed(1) : '0.0'}% de las ventas` },
    ];
  });

  /** Semanas (lunes a domingo) que tocan el mes; la última va resaltada si sigue en curso. */
  protected readonly semanas = computed(() => {
    const m = this.mes();
    const lunes = new Date(m.desde.getTime() - ((m.desde.getDay() + 6) % 7) * DIA);
    const lista: { etiqueta: string; total: number; actual: boolean }[] = [];
    for (let ini = lunes; ini.getTime() <= m.hasta.getTime(); ini = new Date(ini.getTime() + 7 * DIA)) {
      const fin = new Date(ini.getTime() + 6 * DIA);
      const d = this.estadisticas.suma(ini, fin.getTime() > Date.now() ? new Date() : fin);
      const actual = fin.getTime() >= new Date().setHours(0, 0, 0, 0) && ini.getTime() <= Date.now();
      lista.push({ etiqueta: `${corto(ini)}–${corto(fin)}${actual ? ' (en curso)' : ''}`, total: d.mostrador + d.reparaciones, actual });
    }
    const mayor = Math.max(1, ...lista.map((s) => s.total));
    return lista.map((s, i) => ({ ...s, alto: Math.max(4, Math.round((s.total / mayor) * 100)), ultima: i === lista.length - 1 }));
  });

  protected readonly categorias = computed(() => porCategoria(this.datos(), this.descuentos(), this.buscar));

  protected readonly metodos = computed(() => {
    const m = this.datos().metodos;
    const total = METODOS.reduce((s, x) => s + m[x.id], 0) || 1;
    return METODOS.map((x) => ({ texto: x.texto, monto: m[x.id], porcentaje: Math.round((m[x.id] / total) * 100) }));
  });

  /**
   * Quién cobró: la parte de cada cajera según sus cortes del mes, aplicada a las ventas del mes
   * (los cortes de prueba y el historial de prueba no salen de los mismos datos; con la API serán uno solo).
   */
  protected readonly cajeras = computed(() => {
    const grupos = new Map<string, { monto: number; turnos: Set<string> }>();
    for (const c of this.cortes().filter((x) => dentro(x.hasta, this.mes()))) {
      const g = grupos.get(c.cajera) ?? { monto: 0, turnos: new Set<string>() };
      g.monto += c.ventas + c.reparaciones;
      g.turnos.add(c.turno.toLowerCase());
      grupos.set(c.cajera, g);
    }
    const total = [...grupos.values()].reduce((s, g) => s + g.monto, 0) || 1;
    const d = this.datos();
    return [...grupos.entries()]
      .sort((a, b) => b[1].monto - a[1].monto)
      .map(([nombre, g]) => ({ nombre, detalle: `turno ${[...g.turnos].join(' y ')}`, monto: ((d.mostrador + d.reparaciones) * g.monto) / total, ventas: Math.round((d.ventas * g.monto) / total) }));
  });

  protected readonly devoluciones = computed(() => {
    const ventas = this.ventasMes();
    const devueltas = ventas.filter((v) => v.devoluciones.length);
    const canceladas = ventas.filter((v) => v.estado === 'cancelada');
    const faltantes = this.cortes().filter((c) => dentro(c.hasta, this.mes()) && c.contado < c.esperado);
    return [
      { texto: 'Devoluciones', valor: `${devueltas.length} · ${dinero(devueltas.reduce((s, v) => s + reembolsado(v), 0))}`, alerta: false },
      { texto: 'Ventas canceladas', valor: `${canceladas.length} · ${dinero(canceladas.reduce((s, v) => s + v.total, 0))}`, alerta: false },
      { texto: 'Faltantes en cortes', valor: `${faltantes.length} · −${dinero(faltantes.reduce((s, c) => s + c.esperado - c.contado, 0))}`, alerta: faltantes.length > 0 },
    ];
  });

  protected dinero(n: number): string {
    return dinero(n);
  }

  protected verMesAnterior(): void {
    this.mesId.set(this.meses[1].id);
  }

  protected exportar(): void {
    const filas: (string | number)[][] = [
      [`Ventas y utilidad · ${this.mes().texto}`],
      [],
      ...this.indicadores().map((i) => [i.titulo, i.valor, i.detalle]),
      [],
      ['Categoría', 'Ventas', 'Costo', 'Utilidad', 'Margen', 'Participación'],
      ...this.categorias().map((f) => [f.categoria, Math.round(f.ventas), Math.round(f.costo), Math.round(f.utilidad), f.margen === null ? '—' : `${f.margen}%`, f.participacion === null ? '—' : `${f.participacion}%`]),
      [],
      ['Método', 'Monto', 'Porcentaje'],
      ...this.metodos().map((m) => [m.texto, Math.round(m.monto), `${m.porcentaje}%`]),
    ];
    exportarCsv(`ventas-y-utilidad-${this.mes().id}`, filas);
  }
}
