import { Component, computed, inject, input, output, signal } from '@angular/core';
import { ProductoInventario } from '../../../cajera/inventario/inventario.datos';
import { InventarioService } from '../../../cajera/inventario/inventario.service';
import { Concepto, Orden } from '../../../cajera/ordenes/ordenes.service';
import { ConfiguracionTallerService } from '../../../jefe/configuracion/configuracion.service';
import { BuscarPiezaComponent } from '../buscar-pieza/buscar-pieza.component';
import { FichaEquipoComponent } from '../ficha-equipo/ficha-equipo.component';
import { FotosComponent } from '../fotos/fotos.component';

export interface DiagnosticoEnviado {
  texto: string;
  resumen: string;
  causa: string;
  dificultad: string;
  tiempo: string;
  nota: string;
  conceptos: Concepto[];
}

const CAUSAS = ['Golpe / caída', 'Humedad', 'Desgaste por uso', 'Falla de fábrica', 'Mal uso', 'Reparación previa', 'Otra'];
const DIFICULTADES = ['Baja', 'Media', 'Alta'];
/** Mano de obra estimada: el nivel del tabulador (J9) que el jefe usará para cotizar. */
const MANO_OBRA = [
  { id: 'bajo', texto: '1 h · nivel bajo', tiempo: '1 h' },
  { id: 'medio', texto: '1 h 30 min · nivel medio', tiempo: '1 h 30 min' },
  { id: 'alto', texto: '2 h o más · nivel alto', tiempo: '2 h' },
];

interface Pieza {
  producto: ProductoInventario;
  cantidad: number;
}

/** T3.1 · Diagnóstico del técnico y propuesta para cotizar. */
@Component({
  selector: 'app-diagnostico-panel',
  standalone: true,
  imports: [FichaEquipoComponent, FotosComponent, BuscarPiezaComponent],
  templateUrl: './diagnostico-panel.component.html',
  styleUrls: ['../banco-comun.css', './diagnostico-panel.component.css'],
})
export class DiagnosticoPanelComponent {
  private readonly inventario = inject(InventarioService);
  private readonly configuracion = inject(ConfiguracionTallerService);

  readonly orden = input.required<Orden>();
  readonly enviar = output<DiagnosticoEnviado>();
  readonly sinReparacion = output<void>();
  readonly necesitoInfo = output<void>();

  protected readonly causas = CAUSAS;
  protected readonly dificultades = DIFICULTADES;
  protected readonly manoObra = MANO_OBRA;

  protected readonly falla = signal('');
  protected readonly causa = signal(CAUSAS[0]);
  protected readonly dificultad = signal('Media');
  protected readonly tiempo = signal('1 h 30 min');
  protected readonly nivel = signal('medio');
  protected readonly nota = signal('');
  protected readonly fotos = signal(0);
  protected readonly piezas = signal<Pieza[]>([]);
  protected readonly intentado = signal(false);

  protected readonly lineas = computed(() => {
    const o = this.orden();
    return [
      `Falla reportada: ${o.ficha?.falla || o.trabajo}`,
      o.ficha?.condicion ? `Condición al recibir: ${o.ficha.condicion}` : '',
      `IMEI ${o.imei || '—'} · Accesorios: ${(o.accesorios || 'ninguno').toLowerCase()}`,
    ].filter(Boolean);
  });

  protected readonly faltaFalla = computed(() => this.falla().trim().length < 10);

  protected stock(p: ProductoInventario): number {
    return this.inventario.paraOrden(p.sku, this.orden().folio);
  }

  protected agregar(p: ProductoInventario): void {
    this.piezas.update((lista) => (lista.some((x) => x.producto.sku === p.sku) ? lista : [...lista, { producto: p, cantidad: 1 }]));
  }

  protected cambiar(sku: string, cambio: number): void {
    this.piezas.update((lista) => lista.map((x) => (x.producto.sku === sku ? { ...x, cantidad: Math.max(1, x.cantidad + cambio) } : x)));
  }

  protected quitar(sku: string): void {
    this.piezas.update((lista) => lista.filter((x) => x.producto.sku !== sku));
  }

  protected elegirNivel(id: string): void {
    this.nivel.set(id);
    this.tiempo.set(MANO_OBRA.find((m) => m.id === id)?.tiempo ?? this.tiempo());
  }

  protected mandar(): void {
    this.intentado.set(true);
    if (this.faltaFalla()) return;
    const nivel = MANO_OBRA.find((m) => m.id === this.nivel())!;
    const precio = this.configuracion.niveles().find((n) => n.id === nivel.id)?.precio ?? 0;
    const conceptos: Concepto[] = [
      ...this.piezas().map((x) => ({ tipo: 'refaccion' as const, descripcion: x.producto.nombre, sku: x.producto.sku, cantidad: x.cantidad, costo: x.producto.costo, precio: x.producto.precio })),
      { tipo: 'mano-obra', descripcion: 'Mano de obra', cantidad: 1, costo: 0, precio, detalle: nivel.texto },
    ];
    const texto = this.falla().trim();
    const resumen = texto.split(/[.:;]/)[0].trim().slice(0, 70);
    this.enviar.emit({ texto, resumen, causa: this.causa().toLowerCase(), dificultad: this.dificultad().toLowerCase(), tiempo: this.tiempo().trim(), nota: this.nota(), conceptos });
  }
}
