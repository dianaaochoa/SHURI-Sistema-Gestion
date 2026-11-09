import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { ProductoInventario } from '../../../cajera/inventario/inventario.datos';
import { InventarioService } from '../../../cajera/inventario/inventario.service';
import { Concepto, Orden, OrdenesService } from '../../../cajera/ordenes/ordenes.service';
import { formatearDinero, formatearHora } from '../../../compartido/formato';
import { atrasada, tiempoEn } from '../../etapas';
import { ConfiguracionTallerService } from '../../configuracion/configuracion.service';
import { AgregarRefaccionComponent } from '../agregar-refaccion/agregar-refaccion.component';
import { existencia } from '../existencia';
import { DatosEnvio, ResumenCotizacionComponent } from '../resumen-cotizacion/resumen-cotizacion.component';

/** J3.2 · Cotizar orden: diagnóstico del técnico (solo lectura), conceptos con precios y total para el cliente. */
@Component({
  selector: 'app-cotizar-orden',
  standalone: true,
  imports: [AgregarRefaccionComponent, ResumenCotizacionComponent],
  templateUrl: './cotizar-orden.component.html',
  styleUrl: './cotizar-orden.component.css',
})
export class CotizarOrdenComponent implements OnInit {
  private readonly servicio = inject(OrdenesService);
  private readonly inventario = inject(InventarioService);
  private readonly jefe = inject(AuthService).sesion()?.nombre ?? '';
  private readonly configuracion = inject(ConfiguracionTallerService);

  readonly orden = input.required<Orden>();
  readonly volver = output<void>();
  readonly enviado = output<string>();
  readonly regresar = output<void>();

  protected readonly dinero = formatearDinero;
  protected readonly conceptos = signal<Concepto[]>([]);
  protected readonly agregando = signal(false);

  ngOnInit(): void {
    // Se parte de lo que sugirió el técnico; el jefe pone los precios finales.
    // La mano de obra toma el precio del tabulador según el nivel que eligió el técnico (Configuración J9).
    this.conceptos.set(
      (this.orden().diagnostico?.conceptos ?? []).map((c) => (c.tipo === 'mano-obra' ? { ...c, precio: this.configuracion.precioDe(`${c.descripcion} ${c.detalle ?? ''}`) ?? c.precio } : { ...c })),
    );
  }

  protected readonly titulo = computed(() => {
    const o = this.orden();
    const marca = o.ficha?.marca ?? (o.equipo.startsWith('iPhone') ? 'Apple' : '');
    return `Cotizar orden ${o.folio} · ${o.equipo.startsWith(marca) ? o.equipo : `${marca} ${o.equipo}`.trim()}`;
  });

  protected readonly subtitulo = computed(() => {
    const o = this.orden();
    const recibido = new Date(o.recibido);
    const dia = recibido.toDateString() === new Date().toDateString() ? 'hoy' : recibido.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '');
    const partes = [o.cliente.nombre, `Recibido ${dia} ${formatearHora(recibido)}`];
    if (o.diagnostico) partes.push(`Diagnóstico de ${o.tecnico.nombre} hace ${tiempoEn(o.diagnostico.fecha)}`);
    if (o.anticipo) partes.push(`Anticipo ${formatearDinero(o.anticipo)}`);
    return partes.join(' · ');
  });

  protected readonly atrasada = computed(() => atrasada(this.orden()));

  protected readonly renglones = computed(() =>
    this.conceptos().map((c) => ({ ...c, existencia: existencia(this.inventario, c, this.orden().folio), importe: c.cantidad * c.precio })),
  );

  protected cambiar(i: number, campo: 'cantidad' | 'precio' | 'costo' | 'descripcion', valor: string): void {
    this.conceptos.update((lista) =>
      lista.map((c, j) => (j !== i ? c : { ...c, [campo]: campo === 'descripcion' ? valor : Math.max(campo === 'cantidad' ? 1 : 0, Number(valor) || 0) })),
    );
  }

  protected quitar(i: number): void {
    this.conceptos.update((lista) => lista.filter((_, j) => j !== i));
  }

  protected agregarManual(): void {
    this.conceptos.update((lista) => [...lista, { tipo: 'otro', descripcion: '', cantidad: 1, costo: 0, precio: 0 }]);
  }

  protected agregarRefaccion(p: ProductoInventario): void {
    this.agregando.set(false);
    const existe = this.conceptos().findIndex((c) => c.sku === p.sku);
    if (existe >= 0) {
      this.cambiar(existe, 'cantidad', String(this.conceptos()[existe].cantidad + 1));
      return;
    }
    // Las refacciones van antes de la mano de obra, como en Figma.
    const nueva: Concepto = { tipo: 'refaccion', descripcion: p.nombre, sku: p.sku, cantidad: 1, costo: p.costo, precio: p.precio };
    this.conceptos.update((lista) => {
      const i = lista.findIndex((c) => c.tipo === 'mano-obra');
      return i < 0 ? [...lista, nueva] : [...lista.slice(0, i), nueva, ...lista.slice(i)];
    });
  }

  protected enviar(datos: DatosEnvio): void {
    const o = this.orden();
    const conceptos = this.conceptos().map((c) => ({ ...c, descripcion: c.descripcion.trim() }));
    let apartadas = 0;
    for (const r of this.renglones()) {
      if (r.existencia?.enStock && r.sku) {
        this.inventario.apartar(r.sku, r.cantidad, o.folio);
        apartadas += r.cantidad;
      }
    }
    this.servicio.enviarPresupuesto(o.folio, { conceptos, ...datos, por: this.jefe });
    const total = this.servicio.ordenes().find((x) => x.folio === o.folio)?.presupuesto?.total ?? 0;
    const partes = [`Presupuesto de ${o.folio} por ${formatearDinero(total)} enviado al portal de ${o.cliente.nombre.split(' ')[0]}`, 'caja recibe el aviso'];
    if (apartadas) partes.push(`${apartadas} ${apartadas === 1 ? 'pieza apartada' : 'piezas apartadas'}`);
    this.enviado.emit(partes.join(' · '));
  }
}
