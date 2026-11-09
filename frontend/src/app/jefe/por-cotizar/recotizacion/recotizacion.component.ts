import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { InventarioService } from '../../../cajera/inventario/inventario.service';
import { Concepto, Orden, OrdenesService, importeConceptos } from '../../../cajera/ordenes/ordenes.service';
import { formatearDinero } from '../../../compartido/formato';
import { diaMes, existencia } from '../existencia';

/** J3.4 · Re-cotización: el cliente decide solo sobre lo nuevo; lo autorizado sigue en curso. */
@Component({
  selector: 'app-recotizacion',
  standalone: true,
  templateUrl: './recotizacion.component.html',
  styleUrl: './recotizacion.component.css',
})
export class RecotizacionComponent implements OnInit {
  private readonly servicio = inject(OrdenesService);
  private readonly inventario = inject(InventarioService);
  private readonly jefe = inject(AuthService).sesion()?.nombre ?? '';

  readonly orden = input.required<Orden>();
  readonly cerrar = output<void>();
  readonly enviado = output<string>();

  protected readonly dinero = formatearDinero;
  protected readonly conceptos = signal<Concepto[]>([]);

  ngOnInit(): void {
    this.conceptos.set((this.orden().danoAdicional?.conceptos ?? []).map((c) => ({ ...c })));
  }

  protected readonly tecnico = computed(() => this.orden().tecnico.nombre.split(' ')[0]);

  protected readonly autorizado = computed(() => {
    const p = this.orden().presupuesto;
    return p ? { fecha: diaMes(p.aprobado ?? p.enviado), texto: `${this.orden().trabajo} · ${formatearDinero(p.total)}` } : null;
  });

  protected readonly renglones = computed(() =>
    this.conceptos().map((c) => {
      const e = existencia(this.inventario, c, this.orden().folio);
      const partes = c.tipo === 'mano-obra' ? [c.detalle ?? ''] : [c.sku ?? '', e?.texto.toLowerCase() ?? '', `costo ${formatearDinero(c.costo)}`];
      return { ...c, linea: partes.filter(Boolean).join(' · ') };
    }),
  );

  protected readonly adicional = computed(() => importeConceptos(this.conceptos()));
  protected readonly nuevoTotal = computed(() => (this.orden().presupuesto?.total ?? 0) + this.adicional());

  protected cambiarPrecio(i: number, valor: string): void {
    this.conceptos.update((lista) => lista.map((c, j) => (j === i ? { ...c, precio: Math.max(0, Number(valor) || 0) } : c)));
  }

  protected enviar(): void {
    const o = this.orden();
    if (this.adicional() <= 0) return;
    this.servicio.enviarRecotizacion(o.folio, this.conceptos(), this.jefe);
    this.enviado.emit(`Re-cotización de ${o.folio} por ${formatearDinero(this.adicional())} enviada al portal de ${o.cliente.nombre.split(' ')[0]} · ${this.tecnico()} sigue con lo autorizado`);
  }
}
