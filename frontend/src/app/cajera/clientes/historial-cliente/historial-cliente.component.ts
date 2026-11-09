import { Component, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatearDinero } from '../../../compartido/formato';
import { DispositivosService } from '../../punto-de-venta/dispositivos.service';
import { ClientesService, ResumenCliente, visita } from '../clientes.service';

type Pestana = 'todo' | 'compras' | 'equipos';
type Periodo = 'todo' | 'anio' | '90';

const PERIODOS: { id: Periodo; texto: string }[] = [
  { id: 'todo', texto: 'Todo el historial' },
  { id: 'anio', texto: 'Este año' },
  { id: '90', texto: 'Últimos 90 días' },
];

/** C8.3 · Historial del cliente (modal): compras, equipos y garantías. */
@Component({
  selector: 'app-historial-cliente',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './historial-cliente.component.html',
  styleUrl: './historial-cliente.component.css',
})
export class HistorialClienteComponent {
  private readonly servicio = inject(ClientesService);
  private readonly dispositivos = inject(DispositivosService);
  readonly resumen = input.required<ResumenCliente>();
  readonly cerrar = output<void>();
  readonly nuevaOrden = output<void>();

  protected readonly dinero = formatearDinero;
  protected readonly visita = visita;
  protected readonly periodos = PERIODOS;
  protected readonly pestana = signal<Pestana>('todo');
  protected readonly periodo = signal<Periodo>('todo');
  protected readonly mensaje = signal<string | null>(null);

  protected readonly cliente = computed(() => this.resumen().cliente);
  protected readonly subtitulo = computed(() => {
    const c = this.cliente();
    const desde = c.desde ?? this.todos().at(-1)?.fecha;
    const mes = desde ? new Date(desde).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }).replace(' de ', ' ') : '';
    return [desde ? `Cliente desde ${mes}` : '', c.telefono, c.correo].filter(Boolean).join(' · ');
  });

  private readonly todos = computed(() => this.servicio.historial(this.cliente()));
  /** Lo del periodo elegido (las pestañas y los totales se cuentan sobre esto). */
  private readonly delPeriodo = computed(() => {
    const p = this.periodo();
    if (p === 'todo') return this.todos();
    const limite = p === 'anio' ? new Date(new Date().getFullYear(), 0, 1).getTime() : Date.now() - 90 * 86_400_000;
    return this.todos().filter((m) => new Date(m.fecha).getTime() >= limite);
  });
  protected readonly conteo = computed(() => {
    const lista = this.delPeriodo();
    const compras = lista.filter((m) => m.tipo === 'Compra');
    return {
      todo: lista.length,
      compras: compras.length,
      montoCompras: compras.reduce((s, m) => s + m.pagado, 0),
      equipos: lista.filter((m) => m.tipo !== 'Compra').length,
      dejados: lista.filter((m) => m.tipo === 'Equipo').length,
      garantias: lista.filter((m) => m.tipo === 'Garantía').length,
      total: lista.reduce((s, m) => s + m.pagado, 0),
    };
  });
  protected readonly filas = computed(() => {
    const p = this.pestana();
    return this.delPeriodo().filter((m) => p === 'todo' || (p === 'compras' ? m.tipo === 'Compra' : m.tipo !== 'Compra'));
  });

  protected imprimir(): void {
    this.mensaje.set(this.dispositivos.imprimir(this.cliente().id) ? `Historial de ${this.cliente().nombre} impreso` : 'La impresora no responde: revisa que esté encendida, con papel y conectada');
  }

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    this.cerrar.emit();
  }
}
