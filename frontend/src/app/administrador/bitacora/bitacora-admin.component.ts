import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { ACCIONES, BitacoraService, TipoAccion } from '../bitacora.service';
import { ExportarBitacoraComponent } from './exportar-bitacora/exportar-bitacora.component';

type Periodo = 'hoy' | 'ayer' | '7' | '30' | 'todo';

const POR_PAGINA = 8;
const DIA = 86_400_000;

export const PERIODOS: { id: Periodo; texto: string; detalle: string }[] = [
  { id: 'hoy', texto: 'Hoy', detalle: 'de hoy' },
  { id: 'ayer', texto: 'Ayer', detalle: 'de ayer' },
  { id: '7', texto: 'Últimos 7 días', detalle: 'de los últimos 7 días' },
  { id: '30', texto: 'Últimos 30 días', detalle: 'de los últimos 30 días' },
  { id: 'todo', texto: 'Todo', detalle: 'registradas' },
];

/** Inicio del día de hoy menos `dias`. */
const dia = (dias: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime() - dias * DIA;
};

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

/** AD8.1 · Bitácora de acciones sensibles (AD8.2 exportar). */
@Component({
  selector: 'app-bitacora-admin',
  standalone: true,
  imports: [RouterLink, ExportarBitacoraComponent],
  templateUrl: './bitacora-admin.component.html',
  styleUrls: ['../reportes.css', './bitacora-admin.component.css'],
})
export class BitacoraAdminComponent {
  private readonly servicio = inject(BitacoraService);
  private readonly auth = inject(AuthService);

  protected readonly periodos = PERIODOS;
  protected readonly acciones = Object.entries(ACCIONES).map(([id, a]) => ({ id: id as TipoAccion, texto: a.texto }));
  protected readonly periodo = signal<Periodo>('hoy');
  protected readonly accion = signal<TipoAccion | ''>('');
  protected readonly pagina = signal(1);
  protected readonly exportando = signal(false);

  /** Puesto corto de cada persona ("Jefe" en vez de "Jefe de técnicos"). */
  private readonly puestos = computed(() => new Map(this.auth.usuarios().map((u) => [u.nombre, u.puesto === 'Jefe de técnicos' ? 'Jefe' : u.puesto])));

  private readonly filtrados = computed(() => {
    const p = this.periodo();
    const [desde, hasta] = p === 'hoy' ? [dia(0), Infinity] : p === 'ayer' ? [dia(1), dia(0)] : p === '7' ? [dia(6), Infinity] : p === '30' ? [dia(29), Infinity] : [0, Infinity];
    const a = this.accion();
    return this.servicio.registros().filter((r) => {
      const t = new Date(r.fecha).getTime();
      return t >= desde && t < hasta && (!a || r.tipo === a);
    });
  });

  protected readonly total = computed(() => this.filtrados().length);
  protected readonly paginas = computed(() => Math.max(1, Math.ceil(this.total() / POR_PAGINA)));

  protected readonly filas = computed(() => {
    const varios = this.periodo() !== 'hoy' && this.periodo() !== 'ayer';
    return this.filtrados()
      .slice((this.pagina() - 1) * POR_PAGINA, this.pagina() * POR_PAGINA)
      .map((r) => {
        const f = new Date(r.fecha);
        const hora = f.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
        return {
          r,
          hora,
          dia: varios ? `${f.getDate()} ${f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}` : '',
          iniciales: iniciales(r.nombre),
          puesto: this.puestos().get(r.nombre) ?? (r.nombre.startsWith('Caja') ? 'Turno de caja' : ''),
          etiqueta: r.etiqueta ?? ACCIONES[r.tipo].texto,
          tono: ACCIONES[r.tipo].tono,
        };
      });
  });

  /** 1 2 3 … 9 alrededor de la página actual. */
  protected readonly numeros = computed<(number | null)[]>(() => {
    const n = this.paginas();
    const a = this.pagina();
    if (n <= 5) return Array.from({ length: n }, (_, i) => i + 1);
    const ver = new Set([1, n, a - 1, a, a + 1].filter((x) => x >= 1 && x <= n));
    const lista: (number | null)[] = [];
    [...ver].sort((x, y) => x - y).forEach((x, i, arr) => {
      if (i && x - arr[i - 1] > 1) lista.push(null);
      lista.push(x);
    });
    return lista;
  });

  protected readonly resumen = computed(() => {
    const total = this.total();
    const mostrados = this.filas().length;
    const detalle = PERIODOS.find((p) => p.id === this.periodo())!.detalle;
    return total ? `Mostrando ${mostrados} de ${total} ${total === 1 ? 'acción' : 'acciones'} ${detalle}` : '';
  });

  protected cambiarPeriodo(valor: string): void {
    this.periodo.set(valor as Periodo);
    this.pagina.set(1);
  }

  protected cambiarAccion(valor: string): void {
    this.accion.set(valor as TipoAccion | '');
    this.pagina.set(1);
  }

  protected ir(n: number): void {
    this.pagina.set(Math.min(this.paginas(), Math.max(1, n)));
  }
}
