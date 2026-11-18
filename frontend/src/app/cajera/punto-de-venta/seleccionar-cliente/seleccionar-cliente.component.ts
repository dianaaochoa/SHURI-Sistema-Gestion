import { AfterViewInit, Component, ElementRef, HostListener, computed, inject, output, signal } from '@angular/core';
import { iniciales } from '../../../sistema/navegacion';
import { ClientesService } from '../../clientes/clientes.service';
import { NuevoClienteComponent } from '../../ordenes/nuevo-cliente/nuevo-cliente.component';
import { Cliente, PUBLICO_GENERAL } from '../clientes.datos';
import { VentaService } from '../venta.service';

const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** C2.5 · Seleccionar cliente (modal): busca por nombre, teléfono o correo. */
@Component({
  selector: 'app-seleccionar-cliente',
  standalone: true,
  imports: [NuevoClienteComponent],
  templateUrl: './seleccionar-cliente.component.html',
  styleUrl: './seleccionar-cliente.component.css',
})
export class SeleccionarClienteComponent implements AfterViewInit {
  readonly cerrar = output<void>();

  private readonly venta = inject(VentaService);
  private readonly clientes = inject(ClientesService);
  /** “Crear cliente nuevo”: el alta (C8.2) se abre aquí mismo con lo buscado. */
  protected readonly alta = signal(false);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly iniciales = iniciales;

  protected readonly busqueda = signal('');
  /** "Público general" siempre va primero (Figma C2.5). */
  protected readonly resultados = computed<Cliente[]>(() => {
    const texto = normalizar(this.busqueda().trim());
    const digitos = texto.replace(/\D/g, '');
    // El mismo registro que Clientes (C8) y Nueva orden: quien se da de alta allá aparece aquí.
    const coinciden = this.clientes.clientes().filter(
      (c) =>
        c.id !== PUBLICO_GENERAL.id &&
        (!texto ||
        normalizar(c.nombre).includes(texto) ||
        normalizar(c.correo ?? '').includes(texto) ||
        (digitos.length >= 3 && (c.telefono ?? '').replace(/\D/g, '').includes(digitos))),
    );
    return [PUBLICO_GENERAL, ...coinciden.slice(0, 6)];
  });
  protected readonly elegido = signal(this.venta.cliente().id);

  ngAfterViewInit(): void {
    this.elemento.nativeElement.querySelector<HTMLInputElement>('input')?.focus();
  }

  protected escribir(texto: string): void {
    this.busqueda.set(texto);
    // Al buscar, se resalta el primer cliente que coincide (no "Público general").
    const primero = this.resultados()[texto.trim() ? 1 : 0] ?? this.resultados()[0];
    this.elegido.set(primero.id);
  }

  protected seleccionar(cliente?: Cliente): void {
    const elegido = cliente ?? this.resultados().find((c) => c.id === this.elegido());
    if (elegido) this.venta.cliente.set(elegido);
    this.cerrar.emit();
  }

  /** Cerrar el alta regresa a la lista con lo que se había buscado. */
  protected volverALista(): void {
    this.alta.set(false);
    setTimeout(() => this.elemento.nativeElement.querySelector<HTMLInputElement>('input')?.focus());
  }

  protected clienteNuevo(cliente: Cliente): void {
    this.clientes.guardar(cliente);
    this.venta.cliente.set(cliente);
    this.cerrar.emit();
  }

  @HostListener('document:keydown', ['$event'])
  protected alPresionarTecla(evento: KeyboardEvent): void {
    // Con el alta abierta, sus teclas son suyas (Esc la cierra y regresa a la lista).
    if (this.alta()) return;
    const lista = this.resultados();
    const actual = lista.findIndex((c) => c.id === this.elegido());
    switch (evento.key) {
      case 'ArrowDown':
        evento.preventDefault();
        this.elegido.set(lista[Math.min(actual + 1, lista.length - 1)].id);
        break;
      case 'ArrowUp':
        evento.preventDefault();
        this.elegido.set(lista[Math.max(actual - 1, 0)].id);
        break;
      case 'Enter':
        if ((evento.target as HTMLElement).tagName === 'A') return;
        evento.preventDefault();
        this.seleccionar();
        break;
      case 'Escape':
        this.cerrar.emit();
        break;
    }
  }
}
