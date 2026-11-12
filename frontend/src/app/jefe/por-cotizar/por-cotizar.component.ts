import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { Orden, OrdenesService } from '../../cajera/ordenes/ordenes.service';
import { formatearDinero } from '../../compartido/formato';
import { slaDiagnostico, atrasada, etapaDe, horasDesde, tiempoEn } from '../etapas';
import { CotizarOrdenComponent } from './cotizar-orden/cotizar-orden.component';
import { RecotizacionComponent } from './recotizacion/recotizacion.component';
import { RegresarTecnicoComponent } from './regresar-tecnico/regresar-tecnico.component';
import { SinReparacionComponent } from './sin-reparacion/sin-reparacion.component';

type Vista = 'por-cotizar' | 're-cotizacion' | 'sin-reparacion' | 'enviados';

interface Renglon {
  orden: Orden;
  detalle: string;
  tiempo: string;
  estado: { texto: string; tono: string; plano?: boolean };
  accion: string;
}

/** J3 · Por cotizar: J3.1 lista · J3.2 cotizar orden · J3.3 sin reparación · J3.4 re-cotización. */
@Component({
  selector: 'app-por-cotizar',
  standalone: true,
  imports: [CotizarOrdenComponent, SinReparacionComponent, RecotizacionComponent, RegresarTecnicoComponent],
  templateUrl: './por-cotizar.component.html',
  styleUrl: '../lista-pagina.css',
})
export class PorCotizarComponent implements OnInit {
  private readonly servicio = inject(OrdenesService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  protected readonly jefe = inject(AuthService).sesion()?.nombre ?? '';
  protected readonly sla = slaDiagnostico();

  protected readonly vista = signal<Vista>('por-cotizar');
  private readonly folio = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  /** Orden que vuelve al técnico con dudas (desde J3.2 o J3.3). */
  protected readonly regresando = signal<Orden | null>(null);

  // ---------- Listas ----------
  private readonly porCotizar = computed(() =>
    this.servicio
      .ordenes()
      .filter((o) => etapaDe(o) === 'por-cotizar')
      .sort((a, b) => Number(atrasada(b)) - Number(atrasada(a)) || a.recibido.localeCompare(b.recibido)),
  );
  private readonly recotizar = computed(() => this.servicio.ordenes().filter((o) => o.danoAdicional));
  private readonly sinReparar = computed(() => this.servicio.ordenes().filter((o) => o.sinReparacion));
  private readonly enviados = computed(() =>
    this.servicio
      .ordenes()
      .filter((o) => o.estado === 'por-aprobar' || o.estado === 'adicional')
      .sort((a, b) => enviado(b).localeCompare(enviado(a))),
  );

  protected readonly indicadores = computed(() => {
    const fuera = this.porCotizar().filter(atrasada).length;
    return [
      { vista: 'por-cotizar' as Vista, valor: this.porCotizar().length, tono: 'peligro', titulo: 'Por cotizar', detalle: fuera ? `${fuera} fuera de tiempo` : 'Todas a tiempo' },
      { vista: 're-cotizacion' as Vista, valor: this.recotizar().length, tono: 'advertencia', titulo: 'Re-cotización', detalle: 'Daño adicional' },
      { vista: 'sin-reparacion' as Vista, valor: this.sinReparar().length, tono: 'peligro', titulo: 'Sin reparación', detalle: 'Por confirmar' },
      { vista: 'enviados' as Vista, valor: this.enviados().length, tono: 'primario', titulo: 'Esperando al cliente', detalle: 'Presupuesto enviado' },
    ];
  });

  protected readonly pestanas = computed(() => [
    { id: 'por-cotizar' as Vista, texto: 'Por cotizar', cuenta: this.porCotizar().length },
    { id: 're-cotizacion' as Vista, texto: 'Re-cotización', cuenta: this.recotizar().length },
    { id: 'sin-reparacion' as Vista, texto: 'Sin reparación', cuenta: this.sinReparar().length },
    { id: 'enviados' as Vista, texto: 'Enviados', cuenta: this.enviados().length },
  ]);

  protected readonly columnaDetalle = computed(
    () => ({ 'por-cotizar': 'Diagnóstico del técnico', 're-cotizacion': 'Daño reportado', 'sin-reparacion': 'Motivo del técnico', enviados: 'Presupuesto' })[this.vista()],
  );
  protected readonly columnaTiempo = computed(() => (this.vista() === 'enviados' ? 'Enviado' : 'Tiempo'));

  protected readonly renglones = computed<Renglon[]>(() => {
    switch (this.vista()) {
      case 'por-cotizar':
        return this.porCotizar().map((o) => {
          const tarde = atrasada(o);
          const nueva = horasDesde(o.diagnostico!.fecha) < 1;
          return {
            orden: o,
            detalle: o.diagnostico!.resumen ?? o.diagnostico!.texto,
            tiempo: tarde ? `${Math.floor(horasDesde(o.recibido))} h` : tiempoEn(o.diagnostico!.fecha),
            estado: tarde ? { texto: 'Atrasada', tono: 'peligro' } : nueva ? { texto: 'Nueva', tono: 'info', plano: true } : { texto: 'A tiempo', tono: 'exito', plano: true },
            accion: 'Cotizar',
          };
        });
      case 're-cotizacion':
        return this.recotizar().map((o) => ({
          orden: o,
          detalle: o.danoAdicional!.texto,
          tiempo: tiempoEn(o.danoAdicional!.fecha),
          estado: o.danoAdicional!.urgente ? { texto: 'Urgente', tono: 'peligro' } : { texto: 'No urgente', tono: 'neutro' },
          accion: 'Re-cotizar',
        }));
      case 'sin-reparacion':
        return this.sinReparar().map((o) => ({
          orden: o,
          detalle: o.sinReparacion!.motivo,
          tiempo: tiempoEn(o.sinReparacion!.fecha),
          estado: { texto: 'Por confirmar', tono: 'peligro' },
          accion: 'Revisar',
        }));
      default:
        return this.enviados().map((o) => ({
          orden: o,
          detalle: o.estado === 'adicional' ? `Adicional ${formatearDinero(o.adicional?.monto ?? 0)}` : formatearDinero(o.presupuesto?.total ?? 0),
          tiempo: tiempoEn(enviado(o)),
          estado: o.estado === 'adicional' ? { texto: 'Re-cotización', tono: 'advertencia' } : { texto: 'Por aprobar', tono: 'advertencia' },
          accion: 'Ver orden',
        }));
    }
  });

  protected tecnicoCorto(o: Orden): string {
    const [nombre, apellido] = o.tecnico.nombre.split(' ');
    return apellido ? `${nombre} ${apellido[0]}.` : nombre;
  }

  // ---------- Orden abierta (?folio=) ----------
  protected readonly orden = computed(() => this.servicio.ordenes().find((o) => o.folio === this.folio()) ?? null);
  /** Qué se abre con el folio: la página de cotizar (J3.2) o uno de los modales (J3.3 · J3.4). */
  protected readonly abierta = computed<'cotizar' | 'sin-reparacion' | 're-cotizacion' | null>(() => {
    const o = this.orden();
    if (!o) return null;
    if (o.sinReparacion) return 'sin-reparacion';
    if (o.danoAdicional) return 're-cotizacion';
    return etapaDe(o) === 'por-cotizar' ? 'cotizar' : null;
  });

  ngOnInit(): void {
    this.ruta.queryParamMap.subscribe((q) => {
      const vista = q.get('vista') as Vista | null;
      if (vista && ['por-cotizar', 're-cotizacion', 'sin-reparacion', 'enviados'].includes(vista)) this.vista.set(vista);
      const folio = q.get('folio');
      this.folio.set(folio ? `#${folio}` : null);
      // Abrir una orden que ya no está por cotizar (p. ej. enviada) lleva a su detalle en el tablero.
      const o = this.orden();
      if (o && !this.abierta()) this.router.navigate(['/jefe/tablero-de-ordenes'], { queryParams: { folio } });
      else if (o?.sinReparacion) this.vista.set('sin-reparacion');
      else if (o?.danoAdicional) this.vista.set('re-cotizacion');
    });
  }

  protected elegir(vista: Vista): void {
    this.aviso.set(null);
    this.router.navigate([], { queryParams: { vista: vista === 'por-cotizar' ? null : vista } });
  }

  protected abrir(o: Orden): void {
    this.aviso.set(null);
    if (this.vista() === 'enviados') {
      this.router.navigate(['/jefe/tablero-de-ordenes'], { queryParams: { folio: o.folio.replace('#', '') } });
      return;
    }
    this.router.navigate([], { queryParams: { folio: o.folio.replace('#', ''), vista: this.vista() === 'por-cotizar' ? null : this.vista() } });
  }

  protected cerrar(mensaje: string | null = null): void {
    this.router.navigate([], { queryParams: { vista: this.vista() === 'por-cotizar' ? null : this.vista() } });
    this.aviso.set(mensaje);
  }

  protected regresar(pregunta: string): void {
    const o = this.regresando();
    if (!o) return;
    this.servicio.regresarAlTecnico(o.folio, pregunta, this.jefe);
    this.regresando.set(null);
    this.cerrar(`${o.folio} regresó a ${o.tecnico.nombre} con tu pregunta · vuelve a “Diagnóstico” en el tablero`);
  }
}

function enviado(o: Orden): string {
  return (o.estado === 'adicional' ? o.adicional?.enviado : o.presupuesto?.enviado) ?? o.recibido;
}
