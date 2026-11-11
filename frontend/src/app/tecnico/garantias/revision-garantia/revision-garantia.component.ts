import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../acceso/auth.service';
import { formatearDinero } from '../../../compartido/formato';
import { Orden, OrdenesService, diasGarantia } from '../../../cajera/ordenes/ordenes.service';
import { diasUsados, etapaGarantia } from '../../../jefe/garantias/garantia';
import { FotosComponent } from '../../banco/fotos/fotos.component';
import { diaCorto } from '../../mi-trabajo';

const RELACION = ['Sí, es la pieza que se cambió', 'Sí, es el mismo trabajo', 'No, daño posterior a la entrega', 'No, es otra falla'];
const MAL_USO = ['Ninguna', 'Humedad', 'Golpe o caída', 'Equipo abierto por terceros', 'Otra'];
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });

/** T4.2 · Revisión de garantía: el técnico manda su reporte y recomendación; el dictamen es del jefe (J4.2). */
@Component({
  selector: 'app-revision-garantia',
  standalone: true,
  imports: [RouterLink, FotosComponent],
  templateUrl: './revision-garantia.component.html',
  styleUrls: ['../../banco/banco-comun.css', './revision-garantia.component.css'],
})
export class RevisionGarantiaComponent {
  private readonly servicio = inject(OrdenesService);
  private readonly nombre = inject(AuthService).sesion()?.nombre ?? '';

  readonly orden = input.required<Orden>();
  readonly volver = output<string>();

  protected readonly relaciones = RELACION;
  protected readonly malUsos = MAL_USO;

  protected readonly hallazgo = signal('');
  protected readonly relacion = signal(RELACION[0]);
  protected readonly malUso = signal(MAL_USO[0]);
  protected readonly trabajo = signal('');
  protected readonly aplica = signal(true);
  protected readonly costo = signal<number | null>(null);
  protected readonly fotos = signal(0);
  protected readonly intentado = signal(false);

  protected readonly etapa = computed(() => etapaGarantia(this.orden()));
  /** Ya mandó su reporte: se muestra tal cual, sin editar. */
  protected readonly enviado = computed(() => this.orden().garantia?.reporte ?? null);

  protected readonly estado = computed(() => {
    switch (this.etapa()) {
      case 'en-revision':
        return { texto: 'Por revisar', tono: 'advertencia' };
      case 'por-dictaminar':
        return { texto: 'Esperando dictamen', tono: 'info' };
      case 'en-reparacion':
        return { texto: 'Garantía en reparación', tono: 'exito' };
      default:
        return { texto: 'Cerrada', tono: 'neutro' };
    }
  });

  protected readonly dias = computed(() => `Garantía: ${diasUsados(this.orden())} de ${diasGarantia()} días`);

  /** "María Hernández · Samsung S22 Ultra · Solicitada hoy 10:30 desde el portal" */
  protected readonly subtitulo = computed(() => {
    const o = this.orden();
    const g = o.garantia!;
    const dia = new Date(g.recibida).toDateString() === new Date().toDateString() ? 'hoy' : `el ${diaCorto(g.recibida)}`;
    return `${o.cliente.nombre} · ${o.equipo} · Solicitada ${dia} ${hora(g.recibida)} ${g.recibio ? `en sucursal (${g.recibio})` : 'desde el portal'}`;
  });

  protected readonly original = computed(() => {
    const o = this.orden();
    const piezas = (o.presupuesto?.conceptos ?? []).filter((c) => c.tipo === 'refaccion').map((c) => `${c.descripcion}${c.sku ? ` · ${c.sku}` : ''}`);
    return {
      titulo: o.entrega ? `Reparación original (${diaCorto(o.entrega.fecha)})` : 'Reparación original',
      datos: [
        ['Trabajo realizado', o.realizado || o.trabajo],
        ['Refacción', piezas.join(', ') || '—'],
        ['Técnico', o.tecnico.nombre],
        ['Entregado', o.entrega ? `${diaCorto(o.entrega.fecha)} · Cubre lo que se reparó ${diasGarantia()} días` : '—'],
      ],
    };
  });

  protected readonly reporteEnviado = computed(() => {
    const r = this.enviado();
    if (!r) return [];
    return [
      ['Falla encontrada', r.hallazgo],
      ['¿Relacionada con la reparación?', r.relacion],
      ['Señales de mal uso', r.malUso],
      ['Trabajo necesario', r.trabajo],
      ['Tu recomendación', `${r.recomienda === 'aplica' ? 'Creo que aplica' : 'Creo que no aplica'} · ${r.motivo}${r.costo ? ` · ${formatearDinero(r.costo)}` : ''}`],
      ['Enviado', `${diaCorto(r.fecha)} ${hora(r.fecha)}`],
    ];
  });

  protected readonly faltaHallazgo = computed(() => this.hallazgo().trim().length < 10);

  protected mandar(): void {
    this.intentado.set(true);
    if (this.faltaHallazgo()) return;
    const aplica = this.aplica();
    const motivo = aplica
      ? this.relacion().startsWith('Sí, es la pieza') ? 'pieza defectuosa' : 'falla de la reparación'
      : this.malUso() !== 'Ninguna' ? `${this.malUso().toLowerCase()} posterior` : 'daño posterior a la entrega';
    this.servicio.enviarReporteGarantia(
      this.orden().folio,
      {
        hallazgo: this.hallazgo().trim(),
        relacion: this.relacion(),
        malUso: this.malUso(),
        trabajo: this.trabajo().trim() || '—',
        recomienda: aplica ? 'aplica' : 'no-aplica',
        motivo,
        costo: !aplica && this.costo() ? this.costo()! : undefined,
      },
      this.nombre,
    );
    this.volver.emit(`Reporte de ${this.orden().folio} enviado al jefe: queda “Esperando dictamen”.`);
  }
}
