import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { Orden, OrdenesService, POR_ASIGNAR, TECNICOS } from '../../cajera/ordenes/ordenes.service';
import { formatearHora } from '../../compartido/formato';
import { ETAPAS, atrasada, etapaDe, horasDesde, inicioEtapa, tiempoEn } from '../etapas';
import { diaMes } from '../por-cotizar/existencia';
import { AsignarTecnicoComponent, Asignacion } from '../tablero/asignar-tecnico/asignar-tecnico.component';
import { cargaTecnico } from './carga';
import { desempeno, mesesRecientes } from './desempeno';

/** Color de la etapa en la tabla (Figma J7). */
const TONO_ETAPA: Record<string, string> = { recibido: 'neutro', diagnostico: 'neutro', 'por-cotizar': 'peligro', 'por-aprobar': 'advertencia', 'en-taller': 'info' };

/** J7 · Técnicos: carga actual de cada técnico, su desempeño del mes y sus órdenes en el taller. */
@Component({
  selector: 'app-tecnicos',
  standalone: true,
  imports: [AsignarTecnicoComponent],
  templateUrl: './tecnicos.component.html',
  styleUrls: ['../lista-pagina.css', './tecnicos.component.css'],
})
export class TecnicosComponent {
  private readonly servicio = inject(OrdenesService);
  private readonly router = inject(Router);
  private readonly jefe = inject(AuthService).sesion()?.nombre ?? '';

  protected readonly meses = mesesRecientes(6);
  protected readonly mes = signal(this.meses[0].clave);
  protected readonly mesTexto = computed(() => this.meses.find((m) => m.clave === this.mes())!.largo);
  /** Clic en una tarjeta: la tabla muestra solo las órdenes de ese técnico. */
  protected readonly filtro = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly reasignando = signal<Orden | null>(null);

  protected readonly tarjetas = computed(() =>
    TECNICOS.map((t) => {
      const { suyas, enCurso, enPausa, estado } = cargaTecnico(t, this.servicio.ordenes());
      const d = desempeno(t.iniciales, this.mes(), this.servicio.ordenes());
      const actual = enCurso
        ? `En curso: ${enCurso.folio} ${enCurso.equipo} · ${tiempoEn(inicioEtapa(enCurso))}`
        : enPausa
          ? `Pausa: ${enPausa.folio} ${enPausa.equipo} · ${(enPausa.pausa?.motivo ?? 'esperando refacción').toLowerCase()}`
          : 'Sin orden en curso';
      return {
        tecnico: t,
        estado,
        actual,
        cifras: [
          { valor: `${suyas.length}`, texto: 'Asignadas' },
          { valor: `${d.terminadas}`, texto: 'Terminadas' },
          { valor: d.promedio, texto: 'Promedio' },
          { valor: `${d.garantias}%`, texto: 'Garantías' },
        ],
      };
    }),
  );

  protected readonly filas = computed(() =>
    this.servicio
      .ordenes()
      .filter((o) => o.tecnico !== POR_ASIGNAR && etapaDe(o) && etapaDe(o) !== 'listo')
      .filter((o) => !this.filtro() || o.tecnico.iniciales === this.filtro())
      .sort((a, b) => TECNICOS.indexOf(TECNICOS.find((t) => t.iniciales === a.tecnico.iniciales)!) - TECNICOS.indexOf(TECNICOS.find((t) => t.iniciales === b.tecnico.iniciales)!) || a.folio.localeCompare(b.folio))
      .map((o) => {
        const etapa = etapaDe(o)!;
        const pausa = o.estado === 'esperando-refaccion';
        const tarde = atrasada(o) || (!!o.prometida && new Date(o.prometida) < new Date());
        return {
          orden: o,
          etapa: o.estado === 'en-garantia' ? { texto: 'Garantía', tono: 'advertencia' } : { texto: ETAPAS.find((e) => e.id === etapa)!.texto, tono: TONO_ETAPA[etapa] },
          tiempo: atrasada(o) ? `${Math.floor(horasDesde(o.recibido))} h` : tiempoEn(inicioEtapa(o)),
          prometido: o.prometida ? `${diaMes(o.prometida)} ${formatearHora(new Date(o.prometida))}` : '—',
          estado: pausa ? { texto: 'En pausa', tono: 'neutro' } : tarde ? { texto: 'Atrasada', tono: 'peligro' } : { texto: 'A tiempo', tono: 'exito' },
          accion: pausa ? 'Reasignar' : 'Ver',
        };
      }),
  );

  protected alternarFiltro(iniciales: string): void {
    this.filtro.update((actual) => (actual === iniciales ? null : iniciales));
  }

  protected accion(o: Orden, accion: string): void {
    this.aviso.set(null);
    if (accion === 'Reasignar') this.reasignando.set(o);
    else this.router.navigate(['/jefe/tablero-de-ordenes'], { queryParams: { folio: o.folio.replace('#', '') } });
  }

  protected reasignado(a: Asignacion): void {
    const o = this.reasignando();
    if (!o) return;
    this.servicio.asignar(o.folio, { ...a, por: this.jefe });
    this.reasignando.set(null);
    this.aviso.set(`${o.folio} reasignada a ${a.tecnico.nombre} · ya le llegó el aviso en su Inicio`);
  }
}
