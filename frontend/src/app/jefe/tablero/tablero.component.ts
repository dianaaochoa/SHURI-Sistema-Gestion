import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { Orden, OrdenesService, POR_ASIGNAR, PRIORIDADES, Prioridad, TECNICOS } from '../../cajera/ordenes/ordenes.service';
import { DispositivosService } from '../../cajera/punto-de-venta/dispositivos.service';
import { ETAPAS, SLA_DIAGNOSTICO_H, atrasada, etapaDe, inicioEtapa, pendienteDeCotizar, tiempoEn } from '../etapas';
import { AsignarTecnicoComponent, Asignacion } from './asignar-tecnico/asignar-tecnico.component';
import { OrdenJefeComponent } from './orden-jefe/orden-jefe.component';

type Filtro = 'atrasadas' | 'pausa' | null;

/** J2 · Tablero de órdenes: J2.1 tablero · J2.2 asignar técnico · J2.3 detalle · J2.4 cargando · J2.5 sin conexión. */
@Component({
  selector: 'app-tablero',
  standalone: true,
  imports: [AsignarTecnicoComponent, OrdenJefeComponent],
  templateUrl: './tablero.component.html',
  styleUrl: './tablero.component.css',
})
export class TableroComponent implements OnInit {
  private readonly servicio = inject(OrdenesService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly jefe = inject(AuthService).sesion()?.nombre ?? '';
  protected readonly dispositivos = inject(DispositivosService);

  protected readonly etapas = ETAPAS;
  protected readonly tecnicos = TECNICOS;
  protected readonly prioridades = Object.entries(PRIORIDADES) as [Prioridad, (typeof PRIORIDADES)[Prioridad]][];
  protected readonly sla = SLA_DIAGNOSTICO_H;

  /** J2.4: la primera carga (la API tardará; aquí se simula un instante). */
  protected readonly cargando = signal(true);
  protected readonly aviso = signal<string | null>(null);

  // ---------- Filtros ----------
  protected readonly busqueda = signal('');
  protected readonly tecnico = signal('');
  protected readonly prioridad = signal<Prioridad | ''>('');
  protected readonly filtro = signal<Filtro>(null);

  private readonly enTaller = computed(() => this.servicio.ordenes().filter((o) => etapaDe(o)));
  protected readonly atrasadas = computed(() => this.enTaller().filter(atrasada).length);
  protected readonly enPausa = computed(() => this.enTaller().filter((o) => o.estado === 'esperando-refaccion').length);

  protected readonly columnas = computed(() => {
    const texto = this.busqueda().trim().toLowerCase();
    const lista = this.enTaller().filter((o) => {
      if (texto && !`${o.folio} ${o.cliente.nombre} ${o.equipo}`.toLowerCase().includes(texto)) return false;
      if (this.tecnico() === 'sin' && o.tecnico !== POR_ASIGNAR) return false;
      if (this.tecnico() && this.tecnico() !== 'sin' && o.tecnico.iniciales !== this.tecnico()) return false;
      if (this.prioridad() && (o.prioridad ?? 'normal') !== this.prioridad()) return false;
      if (this.filtro() === 'atrasadas' && !atrasada(o)) return false;
      if (this.filtro() === 'pausa' && o.estado !== 'esperando-refaccion') return false;
      return true;
    });
    const peso = { urgente: 0, alta: 1, normal: 2 };
    return ETAPAS.map((e) => ({
      ...e,
      ordenes: lista
        .filter((o) => etapaDe(o) === e.id)
        .sort((a, b) => peso[a.prioridad ?? 'normal'] - peso[b.prioridad ?? 'normal'] || inicioEtapa(a).localeCompare(inicioEtapa(b))),
    }));
  });

  protected alternarFiltro(f: Exclude<Filtro, null>): void {
    this.filtro.update((actual) => (actual === f ? null : f));
  }

  // ---------- Tarjeta ----------
  protected readonly atrasada = atrasada;

  protected tiempo(o: Orden): string {
    return atrasada(o) ? tiempoEn(o.recibido, true) : tiempoEn(inicioEtapa(o));
  }

  /** Renglón corto bajo el cliente (Figma: "Diagnóstico listo", "$1,150 enviado", "Avisado al cliente"). */
  protected nota(o: Orden): string {
    if (o.sinReparacion) return 'Reporte: sin reparación';
    if (o.danoAdicional) return 'Daño adicional reportado';
    switch (etapaDe(o)) {
      case 'por-cotizar':
        return 'Diagnóstico listo';
      case 'por-aprobar':
        return `$${(o.presupuesto?.total ?? 0).toLocaleString('es-MX')} enviado`;
      case 'listo':
        return o.estado === 'sin-reparacion' ? 'Sin reparar · avisado' : 'Avisado al cliente';
      default:
        return o.trabajo;
    }
  }

  /** Etiqueta de la esquina: qué toca hacer con la orden. */
  protected etiqueta(o: Orden): { texto: string; tono: string } | null {
    if (atrasada(o)) return { texto: 'Atrasada', tono: 'peligro' };
    if (o.sinReparacion) return { texto: 'Confirmar', tono: 'peligro' };
    if (o.danoAdicional) return { texto: 'Re-cotizar', tono: 'advertencia' };
    switch (o.estado) {
      case 'esperando-refaccion':
        return { texto: 'En pausa', tono: 'neutro' };
      case 'adicional':
        return { texto: 'Adicional', tono: 'advertencia' };
      case 'en-garantia':
        return { texto: 'Garantía', tono: 'advertencia' };
      case 'en-taller':
        return { texto: 'En curso', tono: 'info' };
      case 'sin-reparacion':
        return { texto: 'Sin reparar', tono: 'neutro' };
    }
    return etapaDe(o) === 'por-cotizar' ? { texto: 'Cotizar', tono: 'info' } : null;
  }

  protected prioridadDe(o: Orden) {
    return o.prioridad && o.prioridad !== 'normal' ? PRIORIDADES[o.prioridad] : null;
  }

  // ---------- Detalle y asignación (J2.2 · J2.3) ----------
  private readonly folio = signal<string | null>(null);
  protected readonly orden = computed(() => this.servicio.ordenes().find((o) => o.folio === this.folio()) ?? null);
  protected readonly asignando = signal<Orden | null>(null);

  ngOnInit(): void {
    setTimeout(() => this.cargando.set(false), 350);
    // Desde Inicio (J1): ?folio=1041 abre la orden; si no tiene técnico, de una vez la asignación.
    this.ruta.queryParamMap.subscribe((q) => {
      const folio = q.get('folio');
      this.folio.set(folio ? `#${folio}` : null);
      const o = this.orden();
      if (o && o.tecnico === POR_ASIGNAR) {
        this.asignando.set(o);
        this.folio.set(null);
      }
    });
  }

  protected abrir(o: Orden): void {
    if (o.tecnico === POR_ASIGNAR) {
      this.asignando.set(o);
      return;
    }
    this.aviso.set(null);
    // Lo que toca cotizar, confirmar o re-cotizar se resuelve en Por cotizar (J3).
    if (pendienteDeCotizar(o)) this.router.navigate(['/jefe/por-cotizar'], { queryParams: { folio: o.folio.replace('#', '') } });
    else this.router.navigate([], { queryParams: { folio: o.folio.replace('#', '') } });
  }

  protected volver(): void {
    this.router.navigate([], { queryParams: {} });
  }

  /** "Asignar técnico" del encabezado: la orden sin técnico más antigua. */
  protected readonly siguienteSinTecnico = computed(() =>
    this.enTaller()
      .filter((o) => o.tecnico === POR_ASIGNAR)
      .sort((a, b) => a.recibido.localeCompare(b.recibido))[0] ?? null,
  );

  /** Si la asignación se abrió desde el Inicio (?folio=), se limpia la dirección para que no vuelva a abrirse. */
  protected cerrarAsignacion(): void {
    this.asignando.set(null);
    if (!this.orden() && this.ruta.snapshot.queryParamMap.has('folio')) this.volver();
  }

  protected asignado(a: Asignacion): void {
    const o = this.asignando();
    if (!o) return;
    const reasigna = o.tecnico !== POR_ASIGNAR;
    this.servicio.asignar(o.folio, { ...a, por: this.jefe });
    this.cerrarAsignacion();
    this.aviso.set(`${o.folio} ${reasigna ? 'reasignada' : 'asignada'} a ${a.tecnico.nombre} · ya le llegó el aviso en su Inicio`);
  }
}
