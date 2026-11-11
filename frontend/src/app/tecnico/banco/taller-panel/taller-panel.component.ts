import { Component, computed, inject, input, output, signal } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { ProductoInventario } from '../../../cajera/inventario/inventario.datos';
import { Orden, OrdenesService } from '../../../cajera/ordenes/ordenes.service';
import { RefaccionesService } from '../../../jefe/refacciones/refacciones.service';
import { BancoService, pasosDe } from '../../banco.service';
import { diaCorto } from '../../mi-trabajo';
import { BuscarPiezaComponent } from '../buscar-pieza/buscar-pieza.component';
import { FichaEquipoComponent } from '../ficha-equipo/ficha-equipo.component';
import { FotosComponent } from '../fotos/fotos.component';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });

const PIEZA: Record<string, { texto: string; tono: string }> = {
  pendiente: { texto: 'Pendiente', tono: 'advertencia' },
  entregada: { texto: 'Entregada', tono: 'exito' },
  pedida: { texto: 'Pedida', tono: 'info' },
  rechazada: { texto: 'Rechazada', tono: 'peligro' },
};

/** T3.3 · Reparación autorizada en el taller. T3.10 · Reparación por garantía (mismo armado, otros textos). */
@Component({
  selector: 'app-taller-panel',
  standalone: true,
  imports: [FichaEquipoComponent, FotosComponent, BuscarPiezaComponent],
  templateUrl: './taller-panel.component.html',
  styleUrls: ['../banco-comun.css', './taller-panel.component.css'],
})
export class TallerPanelComponent {
  private readonly ordenes = inject(OrdenesService);
  private readonly refacciones = inject(RefaccionesService);
  private readonly banco = inject(BancoService);
  private readonly nombre = inject(AuthService).sesion()?.nombre ?? '';

  readonly orden = input.required<Orden>();
  readonly pausar = output<void>();
  readonly necesitoInfo = output<void>();
  readonly danoAdicional = output<void>();
  readonly listo = output<void>();

  protected readonly fotos = signal(2);
  protected readonly nota = signal('');
  protected readonly pedida = signal('');

  protected readonly garantia = computed(() => this.orden().estado === 'en-garantia');
  protected readonly pasos = computed(() => pasosDe(this.orden()));
  protected readonly marcados = computed(() => this.banco.marcados(this.orden()));

  protected readonly lineas = computed(() => {
    const o = this.orden();
    if (this.garantia()) return [`Falla en garantía: ${o.garantia?.falla}`];
    return [
      o.diagnostico ? `Diagnóstico: ${o.diagnostico.resumen ?? o.diagnostico.texto}` : `Falla reportada: ${o.ficha?.falla || o.trabajo}`,
      `Trabajo autorizado: ${o.presupuesto?.descripcion || o.trabajo}`,
    ];
  });

  /** "Reparación original" de la garantía (Figma T3.10). */
  protected readonly original = computed(() => {
    const o = this.orden();
    const r = o.garantia?.reporte;
    return [
      ['Trabajo', `${o.trabajo}${o.entrega ? ` · ${diaCorto(o.entrega.fecha)}` : ''} · ${o.tecnico.nombre}`],
      ['Falla reportada en garantía', o.garantia?.falla ?? '—'],
      ['Tu reporte', r ? r.hallazgo : '—'],
    ];
  });

  protected readonly piezas = computed(() =>
    this.refacciones
      .solicitudes()
      .filter((s) => s.orden === this.orden().folio)
      .map((s) => ({ s, ...PIEZA[s.estado], texto: s.entregada ? `Entregada ${hora(s.entregada)}` : PIEZA[s.estado].texto })),
  );

  /** Notas internas como "10:05 — texto". */
  protected readonly notas = computed(() => (this.orden().notas ?? []).map((n) => `${hora(n.fecha)} — ${n.texto}`));

  protected marcar(i: number, hecho: boolean): void {
    this.banco.marcar(this.orden(), i, hecho);
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
