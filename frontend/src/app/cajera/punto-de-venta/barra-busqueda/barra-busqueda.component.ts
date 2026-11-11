import { Component, DestroyRef, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatearDinero } from '../../../compartido/formato';
import { InventarioService, disponible } from '../../inventario/inventario.service';
import { CATALOGO, Producto } from '../catalogo.datos';
import { DispositivosService } from '../dispositivos.service';
import { IVA, VentaService } from '../venta.service';

const sinAcentos = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Barra del punto de venta: búsqueda global (C2.3 / C2.4), reloj y estado de conexión. */
@Component({
  selector: 'app-barra-busqueda',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './barra-busqueda.component.html',
  styleUrl: './barra-busqueda.component.css',
})
export class BarraBusquedaComponent {
  /** Se agregó un producto al ticket. */
  readonly agregado = output<void>();
  /** Enter con el buscador vacío (Figma: "Cobrar [Enter]"). */
  readonly cobrar = output<void>();
  /** Abrir C2.7 con datos precargados. */
  readonly temporal = output<{ nombre: string; precio: number | null }>();

  private readonly venta = inject(VentaService);
  private readonly inventario = inject(InventarioService);
  private readonly campo = viewChild.required<ElementRef<HTMLInputElement>>('campo');
  protected readonly dinero = formatearDinero;

  protected readonly hora = signal(horaActual());
  /** Conexión y ventas por sincronizar (C2.16). */
  protected readonly dispositivos = inject(DispositivosService);

  protected readonly busqueda = signal('');
  protected readonly resaltado = signal(0);
  protected readonly resultados = computed(() => {
    const texto = sinAcentos(this.busqueda().trim());
    if (texto.length < 2) return [];
    // Disponibles según Inventario (C7): stock menos lo apartado, y baja con cada venta.
    return CATALOGO.filter(
      (p) => sinAcentos(p.nombre).includes(texto) || sinAcentos(p.sku).includes(texto) || p.codigoBarras === texto,
    ).map((p) => {
      const enInventario = this.inventario.buscar(p.sku);
      return enInventario ? { ...p, disponibles: disponible(enInventario) } : p;
    });
  });
  protected readonly abierta = computed(() => this.busqueda().trim().length >= 2);
  protected readonly esCodigo = computed(() => /^\d{6,}$/.test(this.busqueda().trim()));

  constructor() {
    const reloj = setInterval(() => this.hora.set(horaActual()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }

  enfocar(): void {
    this.campo().nativeElement.focus();
  }

  limpiar(): void {
    this.busqueda.set('');
    this.resaltado.set(0);
  }

  estaEnfocada(): boolean {
    return document.activeElement === this.campo().nativeElement;
  }

  protected escribir(texto: string): void {
    this.busqueda.set(texto);
    this.resaltado.set(0);
  }

  protected agregar(producto: Producto): void {
    if (producto.disponibles < 1 || !this.venta.agregar(producto)) return;
    this.limpiar();
    this.enfocar();
    this.agregado.emit();
  }

  protected venderComoTemporal(nombre: string, precioSinIva: number | null): void {
    this.temporal.emit({ nombre, precio: precioSinIva === null ? null : Math.round(precioSinIva * (1 + IVA) * 100) / 100 });
    this.limpiar();
  }

  protected alTeclear(evento: KeyboardEvent): void {
    const resultados = this.resultados();
    switch (evento.key) {
      case 'ArrowDown':
        evento.preventDefault();
        this.resaltado.update((i) => Math.min(i + 1, resultados.length - 1));
        break;
      case 'ArrowUp':
        evento.preventDefault();
        this.resaltado.update((i) => Math.max(i - 1, 0));
        break;
      case 'Enter': {
        evento.preventDefault();
        evento.stopPropagation();
        if (!this.busqueda().trim()) {
          this.cobrar.emit();
          break;
        }
        const elegido = resultados[this.resaltado()];
        if (elegido) this.agregar(elegido);
        break;
      }
      case 'Escape':
        evento.stopPropagation();
        this.limpiar();
        break;
    }
  }
}

function horaActual(): string {
  return new Date().toLocaleTimeString('es-MX', { hour12: false });
}
