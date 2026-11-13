import { Component, computed, inject, input, output, signal } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { formatearDinero } from '../../../compartido/formato';
import { CajaService } from '../../../cajera/caja.service';
import { Corte, CorteService, DecisionCorte, METODO_TEXTO, diferencia } from '../../../cajera/corte/corte.service';
import { calcularTotales } from '../../../cajera/punto-de-venta/venta.service';
import { HistorialVentasService } from '../../../cajera/ventas/historial-ventas.service';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
const dia = (iso: string) => `${new Date(iso).getDate()} ${new Date(iso).toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;

const DECISIONES: { id: DecisionCorte; texto: string; detalle: string }[] = [
  { id: 'descontar', texto: 'Descontar a la cajera', detalle: 'Se registra para nómina' },
  { id: 'absorber', texto: 'Absorber la diferencia', detalle: 'Pérdida del negocio' },
  { id: 'investigar', texto: 'Investigar', detalle: 'Queda pendiente con nota' },
];

/** AD3.2 · Corte de un turno (o el turno abierto, en vivo) con su arqueo y el visto bueno del administrador. */
@Component({
  selector: 'app-detalle-corte',
  standalone: true,
  templateUrl: './detalle-corte.component.html',
  styleUrl: './detalle-corte.component.css',
})
export class DetalleCorteComponent {
  private readonly servicio = inject(CorteService);
  private readonly caja = inject(CajaService);
  private readonly ventas = inject(HistorialVentasService).ventas;
  private readonly nombre = inject(AuthService).sesion()?.nombre ?? '';

  /** null = turno abierto. */
  readonly corte = input<Corte | null>(null);
  readonly volver = output<string>();

  protected readonly decisiones = DECISIONES;
  protected readonly decision = signal<DecisionCorte>('absorber');
  protected readonly nota = signal('');
  protected readonly intentado = signal(false);

  /** Tramo del turno: lo cerrado o lo que va del turno abierto. */
  private readonly tramo = computed(() => {
    const c = this.corte();
    if (c) return { desde: c.desde, hasta: c.hasta, fondo: c.fondo };
    const t = this.caja.turno();
    return { desde: t?.desde ?? new Date().toISOString(), hasta: '9999', fondo: t?.fondo ?? 0 };
  });

  protected readonly titulo = computed(() => {
    const c = this.corte();
    if (!c) return `Turno abierto · ${this.caja.turno()?.turno ?? ''}`;
    return `Corte del ${dia(c.hasta)} · ${c.turno}`;
  });

  protected readonly subtitulo = computed(() => {
    const c = this.corte();
    if (!c) return `${this.caja.turno()?.caja ?? 'Caja 01'} · desde las ${hora(this.tramo().desde)} · en vivo`;
    return `${c.cajera} · ${c.caja} · ${hora(c.desde)} – ${hora(c.hasta)} · Cerrado por ${c.cajera.split(' ')[0]}`;
  });

  protected readonly dif = computed(() => {
    const c = this.corte();
    return c ? diferencia(c) : 0;
  });

  protected readonly pastilla = computed(() => {
    const c = this.corte();
    if (!c) return { texto: 'Abierto', tono: 'info' };
    const d = this.dif();
    if (d < 0) return { texto: `Faltante −${formatearDinero(-d)}`, tono: 'peligro' };
    if (d > 0) return { texto: `Sobrante +${formatearDinero(d)}`, tono: 'advertencia' };
    return { texto: 'Cuadrado', tono: 'exito' };
  });

  protected readonly movimientos = computed(() =>
    this.servicio.movimientosEntre(this.tramo().desde, this.tramo().hasta, this.tramo().fondo).map((m) => ({ hora: hora(m.fecha), concepto: m.concepto, metodo: METODO_TEXTO[m.metodo], monto: m.monto })),
  );

  /** Los cortes de prueba no traen sus ventas en la app: solo se ve la apertura. */
  protected readonly sinDetalle = computed(() => !!this.corte() && !this.corte()!.desglose && this.movimientos().length <= 1);

  protected readonly arqueo = computed(() => {
    const c = this.corte();
    const r = c ?? { ...this.servicio.resumen(), contado: 0 };
    const pagos = (c ? c.desglose?.pagos : this.servicio.resumen().desglose.pagos) ?? 0;
    const otros = r.tarjeta + r.transferencias;
    const filas: [string, number][] = [
      ['Fondo inicial', r.fondo],
      ['Ventas de mostrador', r.ventas],
      ['Cobros de reparación', r.reparaciones],
      ['Cobrado con tarjeta o transferencia', -otros],
      ['Retiros a gerencia', r.retiros + pagos],
      ['Pagos a proveedor', -pagos],
    ];
    return { filas, esperado: r.esperado, contado: c ? c.contado : null };
  });

  protected readonly ventasTurno = computed(() => {
    const { desde, hasta } = this.tramo();
    return this.ventas().filter((v) => v.fecha >= desde && v.fecha <= hasta);
  });

  protected readonly descuentos = computed(() => {
    const con = this.ventasTurno().filter((v) => v.estado !== 'cancelada' && (v.descuento || v.lineas.some((l) => l.descuento)));
    if (!con.length) return 'Ninguno en este turno';
    const monto = con.reduce((s, v) => s + calcularTotales(v.lineas, v.descuento).descuento * 1.16, 0);
    const mayor = con
      .map((v) => ({ folio: v.folio, pct: v.descuento?.modo === '%' ? v.descuento.valor : Math.max(0, ...v.lineas.map((l) => l.descuento)) }))
      .sort((a, b) => b.pct - a.pct)[0];
    return `${con.length} · ${formatearDinero(monto, true)} · el mayor ${mayor.pct}% en ${mayor.folio}`;
  });

  protected readonly cancelaciones = computed(() => this.ventasTurno().filter((v) => v.estado === 'cancelada').length);

  /** Ya decidido (descontar o absorber); "Investigar" se puede volver a decidir. */
  protected readonly decidido = computed(() => {
    const r = this.corte()?.revision;
    return r && r.decision !== 'investigar' ? r : null;
  });
  protected readonly enInvestigacion = computed(() => this.corte()?.revision?.decision === 'investigar' ? this.corte()!.revision! : null);

  protected readonly textoDecision = (id: DecisionCorte) => DECISIONES.find((d) => d.id === id)!.texto;

  protected dinero(n: number): string {
    if (Math.abs(n) < 0.005) return formatearDinero(0);
    return n < 0 ? `−${formatearDinero(-n)}` : formatearDinero(n);
  }

  protected fechaRevision(iso: string): string {
    return `${dia(iso)} ${hora(iso)}`;
  }

  protected marcar(): void {
    const c = this.corte();
    if (!c) return;
    this.intentado.set(true);
    if (this.decision() === 'investigar' && !this.nota().trim()) return;
    this.servicio.revisar(c.folio, this.decision(), this.nota(), this.nombre);
    this.volver.emit(`${this.titulo()} revisado: ${this.textoDecision(this.decision()).toLowerCase()}.`);
  }
}
