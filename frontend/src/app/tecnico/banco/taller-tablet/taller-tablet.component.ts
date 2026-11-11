import { Component, computed, inject, input, output, signal } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { ProductoInventario } from '../../../cajera/inventario/inventario.datos';
import { Orden, OrdenesService } from '../../../cajera/ordenes/ordenes.service';
import { RefaccionesService } from '../../../jefe/refacciones/refacciones.service';
import { BancoService, pasosDe } from '../../banco.service';
import { BuscarPiezaComponent } from '../buscar-pieza/buscar-pieza.component';
import { FichaEquipoComponent } from '../ficha-equipo/ficha-equipo.component';
import { FotosComponent } from '../fotos/fotos.component';

type Pestana = 'trabajo' | 'refacciones' | 'fotos' | 'notas' | 'equipo';

const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: 'trabajo', texto: 'Trabajo' },
  { id: 'refacciones', texto: 'Refacciones' },
  { id: 'fotos', texto: 'Fotos' },
  { id: 'notas', texto: 'Notas' },
  { id: 'equipo', texto: 'Equipo' },
];

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
const PIEZA: Record<string, { texto: string; tono: string }> = {
  pendiente: { texto: 'Pendiente', tono: 'advertencia' },
  entregada: { texto: 'Entregada', tono: 'exito' },
  pedida: { texto: 'Pedida', tono: 'info' },
  rechazada: { texto: 'Rechazada', tono: 'peligro' },
};

/** T7 · Banco en tablet: pestañas, pasos grandes para el dedo y botones de acción a la derecha. */
@Component({
  selector: 'app-taller-tablet',
  standalone: true,
  imports: [FichaEquipoComponent, FotosComponent, BuscarPiezaComponent],
  templateUrl: './taller-tablet.component.html',
  styleUrl: './taller-tablet.component.css',
})
export class TallerTabletComponent {
  private readonly ordenes = inject(OrdenesService);
  private readonly refacciones = inject(RefaccionesService);
  private readonly banco = inject(BancoService);
  private readonly nombre = inject(AuthService).sesion()?.nombre ?? '';

  readonly orden = input.required<Orden>();
  readonly pausar = output<void>();
  readonly necesitoInfo = output<void>();
  readonly danoAdicional = output<void>();
  readonly listo = output<void>();

  protected readonly pestanas = PESTANAS;
  protected readonly pestana = signal<Pestana>('trabajo');
  protected readonly fotos = signal(2);
  protected readonly nota = signal('');
  protected readonly pedida = signal('');

  protected readonly garantia = computed(() => this.orden().estado === 'en-garantia');
  protected readonly pasos = computed(() => pasosDe(this.orden()));
  protected readonly marcados = computed(() => this.banco.marcados(this.orden()));
  protected readonly pendientes = computed(() => this.marcados().filter((m) => !m).length);

  protected readonly piezas = computed(() =>
    this.refacciones
      .solicitudes()
      .filter((s) => s.orden === this.orden().folio)
      .map((s) => ({ s, tono: PIEZA[s.estado].tono, texto: s.entregada ? `Entregada ${hora(s.entregada)}` : PIEZA[s.estado].texto })),
  );

  protected readonly notas = computed(() => (this.orden().notas ?? []).map((n) => `${hora(n.fecha)} — ${n.texto}`));

  protected readonly lineas = computed(() => {
    const o = this.orden();
    if (this.garantia()) return [`Falla en garantía: ${o.garantia?.falla}`, `Dictamen del jefe: ${o.garantia?.decision?.texto ?? '—'}`];
    return [
      o.diagnostico ? `Diagnóstico: ${o.diagnostico.resumen ?? o.diagnostico.texto}` : `Falla reportada: ${o.ficha?.falla || o.trabajo}`,
      `Trabajo autorizado: ${o.presupuesto?.descripcion || o.trabajo}`,
      ...(o.pausa ? [`En pausa: ${o.pausa.motivo}${o.pausa.detalle ? ` · ${o.pausa.detalle}` : ''}`] : []),
      ...(o.estado === 'adicional' ? ['El cliente revisa el cargo adicional: termina lo autorizado.'] : []),
    ];
  });

  protected marcar(i: number, hecho: boolean): void {
    this.banco.marcar(this.orden(), i, hecho);
  }

  /** "Tomar foto": se suma a las fotos de la reparación y se muestra la pestaña Fotos. */
  protected tomarFoto(): void {
    this.fotos.update((n) => n + 1);
    this.pestana.set('fotos');
  }

  protected solicitar(p: ProductoInventario): void {
    const s = this.refacciones.solicitar({ orden: this.orden().folio, tecnico: this.nombre, sku: p.sku, nombre: p.nombre, cantidad: 1, urgencia: 'normal' });
    this.pedida.set(`${s.nombre} pedida al jefe (${s.id}).`);
  }

  protected guardarNota(): void {
    const texto = this.nota().trim();
    if (!texto) return;
    this.ordenes.agregarNota(this.orden().folio, texto, this.nombre.split(' ')[0]);
    this.nota.set('');
  }
}
