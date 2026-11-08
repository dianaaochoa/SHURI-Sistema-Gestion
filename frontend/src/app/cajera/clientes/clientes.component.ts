import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { formatearDinero } from '../../compartido/formato';
import { NuevoClienteComponent } from '../ordenes/nuevo-cliente/nuevo-cliente.component';
import { Cliente } from '../punto-de-venta/clientes.datos';
import { ClientesService, ResumenCliente, visita } from './clientes.service';
import { ContrasenaTemporalComponent } from './contrasena-temporal/contrasena-temporal.component';
import { FichaClienteComponent } from './ficha-cliente/ficha-cliente.component';
import { HistorialClienteComponent } from './historial-cliente/historial-cliente.component';

type Filtro = 'todos' | 'activos' | 'listo' | 'por aprobar' | 'sin';

const FILTROS: { id: Filtro; texto: string }[] = [
  { id: 'todos', texto: 'Todos los clientes' },
  { id: 'activos', texto: 'Con equipos en el taller' },
  { id: 'listo', texto: 'Con equipo listo' },
  { id: 'por aprobar', texto: 'Esperando su aprobación' },
  { id: 'sin', texto: 'Sin equipos' },
];

/** C8 · Clientes: C8.1 lista y ficha · C8.2 nuevo cliente · C8.3 historial · C8.4 contraseña temporal. */
@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [FichaClienteComponent, NuevoClienteComponent, HistorialClienteComponent, ContrasenaTemporalComponent],
  templateUrl: './clientes.component.html',
  styleUrl: './clientes.component.css',
})
export class ClientesComponent {
  private readonly servicio = inject(ClientesService);
  private readonly router = inject(Router);

  protected readonly dinero = formatearDinero;
  protected readonly visita = visita;
  protected readonly filtros = FILTROS;

  protected readonly busqueda = signal('');
  protected readonly filtro = signal<Filtro>('todos');
  protected readonly aviso = signal<string | null>(null);

  /** Ordenados por la visita más reciente, como en Figma. */
  protected readonly lista = computed(() => {
    const texto = this.busqueda().trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const digitos = texto.replace(/\D/g, '');
    return this.servicio
      .resumenes()
      .filter((r) => {
        const c = r.cliente;
        if (texto) {
          const nombre = c.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
          const porTelefono = digitos.length >= 4 && (c.telefono ?? '').replace(/\D/g, '').includes(digitos);
          if (!nombre.includes(texto) && !(c.correo ?? '').toLowerCase().includes(texto) && !porTelefono) return false;
        }
        switch (this.filtro()) {
          case 'activos': return !!r.equipos;
          case 'sin': return !r.equipos;
          case 'todos': return true;
          default: return r.equipos?.categoria === this.filtro();
        }
      })
      .sort((a, b) => (b.ultimaVisita ?? b.cliente.desde ?? '').localeCompare(a.ultimaVisita ?? a.cliente.desde ?? ''));
  });

  private readonly elegidoId = signal<string | null>(inject(ActivatedRoute).snapshot.queryParamMap.get('cliente'));
  protected readonly elegido = computed<ResumenCliente | null>(() => {
    const lista = this.lista();
    return lista.find((r) => r.cliente.id === this.elegidoId()) ?? lista[0] ?? null;
  });

  protected elegir(r: ResumenCliente): void {
    this.elegidoId.set(r.cliente.id);
    this.aviso.set(null);
    // Apilado (≤ 1280 px) la ficha queda bajo la lista: se lleva a la vista.
    if (window.innerWidth <= 1280) setTimeout(() => document.querySelector('app-ficha-cliente')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  /** Flechas ↑ ↓ en la tabla cambian de cliente. */
  protected mover(evento: Event, paso: number): void {
    evento.preventDefault();
    const lista = this.lista();
    const i = lista.findIndex((r) => r.cliente.id === this.elegido()?.cliente.id);
    const siguiente = lista[Math.min(Math.max(0, i + paso), lista.length - 1)];
    if (siguiente) {
      this.elegir(siguiente);
      setTimeout(() => document.querySelector<HTMLElement>('.tabla-clientes tr[aria-selected="true"]')?.focus());
    }
  }

  // ---------- Modales ----------
  protected readonly modal = signal<'nuevo' | 'editar' | 'historial' | 'temporal' | null>(null);
  protected readonly temporal = signal('');

  protected guardado(cliente: Cliente): void {
    const nuevo = this.modal() === 'nuevo';
    this.servicio.guardar(cliente);
    this.modal.set(null);
    this.busqueda.set('');
    this.filtro.set('todos');
    this.elegidoId.set(cliente.id);
    this.aviso.set(nuevo ? `${cliente.nombre} quedó registrado. Ya lo encuentras en Punto de venta y en Nueva orden.` : `Se guardaron los cambios de ${cliente.nombre}.`);
  }

  protected generarTemporal(): void {
    const c = this.elegido()?.cliente;
    if (!c) return;
    this.temporal.set(this.servicio.generarTemporal(c));
    this.modal.set('temporal');
  }

  protected nuevaOrden(): void {
    const c = this.elegido()?.cliente;
    this.router.navigate(['/cajera/nueva-orden'], { queryParams: { cliente: c?.telefono ?? c?.nombre } });
  }
}
