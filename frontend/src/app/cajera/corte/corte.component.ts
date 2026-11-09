import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { formatearHora } from '../../compartido/formato';
import { AbrirTurnoComponent } from '../abrir-turno/abrir-turno.component';
import { CajaService } from '../caja.service';
import { Corte, CorteService } from './corte.service';
import { HistorialCortesComponent, mesesDeCortes } from './historial-cortes/historial-cortes.component';
import { MovimientoEfectivoComponent } from './movimiento-efectivo/movimiento-efectivo.component';
import { TurnoActualComponent } from './turno-actual/turno-actual.component';
import { TurnoCerradoComponent } from './turno-cerrado/turno-cerrado.component';

/** C10 · Corte de caja: C10.1 turno actual · C10.2 historial · C10.3 movimiento · C10.4 cerrar turno · C10.5 turno cerrado. */
@Component({
  selector: 'app-corte',
  standalone: true,
  imports: [TurnoActualComponent, HistorialCortesComponent, MovimientoEfectivoComponent, TurnoCerradoComponent, AbrirTurnoComponent],
  templateUrl: './corte.component.html',
  styleUrl: './corte.component.css',
})
export class CorteComponent {
  protected readonly caja = inject(CajaService);
  private readonly servicio = inject(CorteService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly pestana = signal<'turno' | 'historial'>('turno');
  protected readonly aviso = signal<string | null>(null);

  /** "Turno matutino · Caja 01 · Ana Martínez · Abierto hoy a las 09:00" */
  protected readonly subtitulo = computed(() => {
    const t = this.caja.turno();
    if (!t) return 'La caja está cerrada';
    const desde = new Date(t.desde);
    const dia = desde.toDateString() === new Date().toDateString() ? 'hoy' : `el ${desde.getDate()}/${desde.getMonth() + 1}`;
    return `Turno ${t.turno.toLowerCase()} · ${t.caja} · ${this.auth.sesion()?.nombre ?? ''} · Abierto ${dia} a las ${formatearHora(desde)}`;
  });

  // Filtros del historial (en el encabezado, como en Figma C10.2)
  protected readonly meses = computed(() => mesesDeCortes(this.servicio.cortes()));
  protected readonly mes = signal<string | null>(null);
  protected readonly mesElegido = computed(() => this.mes() ?? this.meses()[0]?.clave ?? '');
  protected readonly cajeras = computed(() => [...new Set(this.servicio.cortes().map((c) => c.cajera))].sort());
  protected readonly cajera = signal('');

  // Modales
  protected readonly movimiento = signal<'retiro' | 'ingreso' | null>(null);
  protected readonly cerrado = signal<Corte | null>(null);
  protected readonly abrir = signal(false);

  protected movimientoRegistrado(texto: string): void {
    this.movimiento.set(null);
    this.aviso.set(texto);
  }

  protected turnoCerrado(corte: Corte): void {
    this.aviso.set(null);
    this.cerrado.set(corte);
  }

  protected abrirNuevo(): void {
    this.cerrado.set(null);
    this.abrir.set(true);
  }

  protected salir(): void {
    this.auth.cerrarSesion();
    this.router.navigateByUrl('/iniciar-sesion');
  }
}
