import { Component, HostListener, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { formatearDinero } from '../../../compartido/formato';
import { TIPOS_AJUSTE, TipoAjuste } from '../inventario.datos';
import { InventarioService, apartadas } from '../inventario.service';

/** C7.4 · Ajuste de inventario (modal): merma o daño, conteo físico o uso interno. */
@Component({
  selector: 'app-ajuste-inventario',
  standalone: true,
  templateUrl: './ajuste-inventario.component.html',
  styleUrl: './ajuste-inventario.component.css',
})
export class AjusteInventarioComponent implements OnInit {
  private readonly inventario = inject(InventarioService);
  private readonly cajera = inject(AuthService).sesion()?.nombre ?? '';

  readonly skuInicial = input<string | null>(null);
  readonly cerrar = output<void>();
  readonly aplicado = output<string>();

  protected readonly dinero = formatearDinero;
  protected readonly tipos = Object.entries(TIPOS_AJUSTE) as [TipoAjuste, (typeof TIPOS_AJUSTE)[TipoAjuste]][];

  protected readonly sku = signal<string | null>(null);
  protected readonly busqueda = signal('');
  protected readonly listaAbierta = signal(false);
  protected readonly tipo = signal<TipoAjuste>('merma');
  protected readonly cantidad = signal<number | null>(null);
  protected readonly motivo = signal('');
  protected readonly intentado = signal(false);

  protected readonly producto = computed(() => (this.sku() ? this.inventario.buscar(this.sku()!) : undefined));
  protected readonly sugerencias = computed(() => {
    const t = this.busqueda().trim().toLowerCase();
    return this.inventario
      .productos()
      .filter((p) => !t || `${p.sku} ${p.nombre} ${p.codigoBarras}`.toLowerCase().includes(t))
      .slice(0, 6);
  });

  /** Diferencia con el stock: negativa al descontar; en conteo físico, contado − sistema. */
  protected readonly diferencia = computed(() => {
    const p = this.producto();
    const n = this.cantidad();
    if (!p || n === null || Number.isNaN(n)) return null;
    return this.tipo() === 'conteo' ? n - p.stock : -n;
  });
  protected readonly despues = computed(() => (this.producto() && this.diferencia() !== null ? this.producto()!.stock + this.diferencia()! : null));
  protected readonly valor = computed(() => (this.producto() && this.diferencia() !== null ? this.diferencia()! * this.producto()!.costo : null));

  protected readonly errores = computed(() => {
    const e: Record<string, string> = {};
    const p = this.producto();
    const n = this.cantidad();
    if (!p) e['producto'] = 'Elige el producto';
    if (n === null || Number.isNaN(n) || !Number.isInteger(n) || n < 0 || (this.tipo() !== 'conteo' && n === 0)) {
      e['cantidad'] = this.tipo() === 'conteo' ? 'Escribe las piezas contadas' : 'Escribe cuántas piezas';
    } else if (p && this.tipo() !== 'conteo' && n > p.stock) e['cantidad'] = `Solo hay ${p.stock} en sistema`;
    else if (p && this.diferencia() === 0) e['cantidad'] = 'El conteo coincide con el sistema';
    else if (p && this.despues() !== null && this.despues()! < apartadas(p)) {
      e['cantidad'] = `Quedarían menos piezas que las apartadas (${p.apartados.map((a) => a.folio).join(', ')})`;
    }
    if (!this.motivo().trim()) e['motivo'] = 'Escribe el motivo';
    return e;
  });

  protected error(campo: string): string | null {
    return this.intentado() ? (this.errores()[campo] ?? null) : null;
  }

  ngOnInit(): void {
    if (this.skuInicial()) this.elegir(this.skuInicial()!);
  }

  protected elegir(sku: string): void {
    const p = this.inventario.buscar(sku);
    if (!p) return;
    this.sku.set(sku);
    this.busqueda.set(`${p.sku} · ${p.nombre}`);
    this.listaAbierta.set(false);
  }

  protected escribir(texto: string): void {
    this.busqueda.set(texto);
    this.sku.set(null);
    this.listaAbierta.set(true);
  }

  /** Enter con el código del lector o el primer resultado. */
  protected enter(evento: Event): void {
    evento.preventDefault();
    const exacto = this.inventario.porCodigo(this.busqueda());
    const primero = exacto ?? this.sugerencias()[0];
    if (primero) this.elegir(primero.sku);
  }

  protected cambiarTipo(tipo: TipoAjuste): void {
    this.tipo.set(tipo);
    this.cantidad.set(null);
  }

  protected aplicar(): void {
    this.intentado.set(true);
    if (Object.keys(this.errores()).length) return;
    const p = this.producto()!;
    const dif = this.diferencia()!;
    const ajuste = this.inventario.aplicarAjuste(p.sku, this.tipo(), dif, this.motivo().trim(), this.cajera);
    const signo = dif > 0 ? `+${dif}` : `−${-dif}`;
    this.aplicado.emit(`${ajuste.folio} · ${p.sku}: ${TIPOS_AJUSTE[this.tipo()].texto.toLowerCase()} ${signo} (quedan ${p.stock + dif}) · ${formatearDinero(Math.abs(ajuste.valor))} a costo`);
  }

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    if (this.listaAbierta()) this.listaAbierta.set(false);
    else this.cerrar.emit();
  }
}
