import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ENTREGABLES, Orden, OrdenesService, diasDesde } from '../../cajera/ordenes/ordenes.service';
import { REGLAS_TALLER } from '../../compartido/reglas-taller';
import { formatearDinero } from '../../compartido/formato';
import { diaMes } from '../por-cotizar/existencia';
import { avisosDe } from './avisos';
import { PoliticaBodegaComponent } from './politica-bodega/politica-bodega.component';

type Vista = 'bodega' | 'vencidos' | 'entregados';


/** J8 · Equipos terminados: J8.1 lista · J8.2 política de bodega. */
@Component({
  selector: 'app-terminados',
  standalone: true,
  imports: [PoliticaBodegaComponent],
  templateUrl: './terminados.component.html',
  styleUrls: ['../lista-pagina.css', './terminados.component.css'],
})
export class TerminadosComponent implements OnInit {
  private readonly servicio = inject(OrdenesService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly vista = signal<Vista>('bodega');
  protected readonly aviso = signal<string | null>(null);
  protected readonly aplicando = signal<Orden | null>(null);
  /** Días sin cobro en bodega (Configuración J9). */
  protected readonly limite = REGLAS_TALLER.diasSinCobro;

  /** Esperan a su dueño en el mostrador o en bodega (lo que caja entrega en C6). */
  private readonly enBodega = computed(() =>
    this.servicio
      .ordenes()
      .filter((o) => ENTREGABLES.includes(o.estado))
      .sort((a, b) => (a.listaDesde ?? a.recibido).localeCompare(b.listaDesde ?? b.recibido)),
  );
  private readonly vencidos = computed(() => this.enBodega().filter((o) => this.dias(o) > this.limite));
  private readonly entregados = computed(() =>
    this.servicio
      .ordenes()
      .filter((o) => (o.estado === 'terminada' || o.estado === 'sin-reparar-entregada') && o.entrega && diasDesde(o.entrega.fecha) <= 30)
      .sort((a, b) => b.entrega!.fecha.localeCompare(a.entrega!.fecha)),
  );

  protected readonly indicadores = computed(() => {
    const semana = this.entregados().filter((o) => diasDesde(o.entrega!.fecha) < 7).length;
    return [
      { vista: 'bodega' as Vista, valor: this.enBodega().filter((o) => o.estado === 'lista' || o.estado === 'garantia-lista').length, tono: 'exito', titulo: 'Listos para entregar', detalle: 'Cliente avisado' },
      { vista: 'bodega' as Vista, valor: this.enBodega().filter((o) => o.estado === 'sin-reparacion').length, tono: 'advertencia', titulo: 'Sin reparación', detalle: 'Por recoger' },
      { vista: 'vencidos' as Vista, valor: this.vencidos().length, tono: 'peligro', titulo: `Más de ${this.limite} días`, detalle: 'Aplicar política de bodega' },
      { vista: 'entregados' as Vista, valor: semana, tono: '', titulo: 'Entregados', detalle: 'Esta semana' },
    ];
  });

  protected readonly pestanas = computed(() => [
    { id: 'bodega' as Vista, texto: `En bodega (${this.enBodega().length})` },
    { id: 'vencidos' as Vista, texto: `Más de ${this.limite} días (${this.vencidos().length})` },
    { id: 'entregados' as Vista, texto: 'Entregados' },
  ]);

  protected readonly filas = computed(() => {
    const lista = this.vista() === 'entregados' ? this.entregados() : this.vista() === 'vencidos' ? this.vencidos() : this.enBodega();
    return lista.map((o) => {
      const dias = this.dias(o);
      const avisos = avisosDe(o);
      const entregado = o.entrega && this.vista() === 'entregados';
      return {
        orden: o,
        resultado: resultado(o),
        tecnico: corto(o.tecnico.nombre),
        listo: o.listaDesde ? (diasDesde(o.listaDesde) === 0 ? 'Hoy' : diaMes(o.listaDesde)) : '—',
        dias: `${dias} ${dias === 1 ? 'día' : 'días'}`,
        vencido: dias > this.limite,
        aviso: avisos.length > 1 ? `${avisos.length} avisos` : avisos.length ? `Portal ${diaMes(avisos[0].fecha)}` : 'Portal',
        politica: o.almacenaje ? (o.almacenaje.perdonado ? 'Perdonado' : `Almacenaje ${formatearDinero(o.almacenaje.monto)}`) : null,
        entregado: entregado ? diaMes(o.entrega!.fecha) : '',
        recogio: entregado ? (o.entrega!.recogio ?? o.cliente.nombre) : '',
        cobrado: entregado ? formatearDinero(o.entrega!.cobrado ?? o.entrega!.pagado) : '',
        accion: entregado ? 'Ver' : dias > this.limite ? 'Aplicar política' : 'Reenviar',
      };
    });
  });

  ngOnInit(): void {
    this.ruta.queryParamMap.subscribe((q) => {
      const vista = q.get('vista') as Vista | null;
      this.vista.set(vista && ['bodega', 'vencidos', 'entregados'].includes(vista) ? vista : 'bodega');
    });
  }

  private dias(o: Orden): number {
    return diasDesde(o.listaDesde ?? o.recibido);
  }

  protected elegir(vista: Vista): void {
    this.aviso.set(null);
    this.router.navigate([], { queryParams: { vista: vista === 'bodega' ? null : vista } });
  }

  protected accion(o: Orden, accion: string): void {
    this.aviso.set(null);
    if (accion === 'Aplicar política') this.aplicando.set(o);
    else if (accion === 'Reenviar') {
      this.servicio.avisar(o.folio, 'Recordatorio para recoger enviado al portal');
      this.aviso.set(`Recordatorio reenviado a ${o.cliente.nombre} en su portal (${o.folio})`);
    } else this.router.navigate(['/jefe/tablero-de-ordenes'], { queryParams: { folio: o.folio.replace('#', '') } });
  }

  protected aplicado(mensaje: string): void {
    this.aplicando.set(null);
    this.aviso.set(mensaje);
  }
}

function resultado(o: Orden): { texto: string; tono: string } {
  if (o.estado === 'garantia-lista' || (o.estado === 'terminada' && o.garantia)) return { texto: 'Garantía', tono: 'info' };
  if (o.estado === 'sin-reparacion' || o.estado === 'sin-reparar-entregada' || /sin reparaci/i.test(o.trabajo)) {
    return o.rechazo ? { texto: 'Rechazado', tono: 'peligro' } : { texto: 'Sin reparación', tono: 'advertencia' };
  }
  return { texto: 'Reparado', tono: 'exito' };
}

const corto = (nombre: string) => {
  const [n, a] = nombre.split(' ');
  return a ? `${n} ${a[0]}.` : n;
};
