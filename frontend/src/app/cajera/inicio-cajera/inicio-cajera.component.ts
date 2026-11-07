import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import {
  formatearDinero,
  formatearDuracion,
  formatearFechaLarga,
  formatearHora,
  saludoDelDia,
} from '../../compartido/formato';
import { AbrirTurnoComponent } from '../abrir-turno/abrir-turno.component';
import { CajaService } from '../caja.service';
import {
  ACCESOS,
  COLUMNAS_ABIERTA,
  COLUMNAS_CERRADA,
  INDICADORES_ABIERTA,
  INDICADORES_CERRADA,
  Indicador,
  VENTAS_EFECTIVO_DEMO,
} from './inicio-cajera.datos';

/** C1.1 Inicio · turno abierto / C1.2 Inicio · caja cerrada. */
@Component({
  selector: 'app-inicio-cajera',
  standalone: true,
  imports: [RouterLink, AbrirTurnoComponent],
  templateUrl: './inicio-cajera.component.html',
  styleUrl: './inicio-cajera.component.css',
})
export class InicioCajeraComponent {
  private readonly caja = inject(CajaService);
  private readonly router = inject(Router);
  private readonly sesion = inject(AuthService).sesion;

  protected readonly turno = this.caja.turno;
  protected readonly abrirTurno = signal(false);
  protected readonly accesos = ACCESOS;

  /** Se actualiza cada 30 s para el contador "4 h 42 min". */
  private readonly ahora = signal(new Date());

  protected readonly saludo = computed(
    () => `${saludoDelDia(this.ahora())}, ${this.sesion()?.nombre.split(' ')[0] ?? ''}`,
  );

  /** C1.1: "Viernes 16 oct 2026 · Caja 01 · SHURI" · C1.2 añade la hora: "… · 08:55 · Caja 01 · SHURI". */
  protected readonly subtitulo = computed(() => {
    const turno = this.turno();
    const fecha = formatearFechaLarga(this.ahora());
    return turno
      ? `${fecha} · ${turno.caja} · SHURI`
      : `${fecha} · ${formatearHora(this.ahora())} · ${this.caja.cajas[0]} · SHURI`;
  });

  protected readonly estadoTurno = computed(() => {
    const turno = this.turno();
    if (!turno) return '';
    const desde = new Date(turno.desde);
    return `Turno abierto desde ${formatearHora(desde)} · ${formatearDuracion(desde, this.ahora())}`;
  });

  protected readonly indicadores = computed<Indicador[]>(() => {
    const turno = this.turno();
    if (!turno) return INDICADORES_CERRADA;
    const efectivo: Indicador = {
      valor: formatearDinero(VENTAS_EFECTIVO_DEMO + turno.fondo, true),
      titulo: 'Efectivo en caja',
      detalle: `Fondo ${formatearDinero(turno.fondo, true)} incluido`,
    };
    return [INDICADORES_ABIERTA[0], efectivo, ...INDICADORES_ABIERTA.slice(1)];
  });

  protected readonly columnas = computed(() => (this.turno() ? COLUMNAS_ABIERTA : COLUMNAS_CERRADA));

  constructor() {
    const reloj = setInterval(() => this.ahora.set(new Date()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }

  /** Atajos de Figma: F1 nueva venta · F3 nueva orden · F4 entregar equipo · F5 buscar folio. */
  @HostListener('window:keydown', ['$event'])
  protected alPresionarTecla(evento: KeyboardEvent): void {
    if (this.abrirTurno()) return;
    const acceso = this.accesos.find((a) => a.tecla === evento.key);
    if (!acceso) return;
    evento.preventDefault();
    if (acceso.requiereCaja && !this.turno()) this.abrirTurno.set(true);
    else this.router.navigate(['/cajera', acceso.ruta]);
  }
}
