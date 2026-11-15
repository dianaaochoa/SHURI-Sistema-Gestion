import { Component, computed, inject, input, output } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { FotosOrdenComponent } from '../../../compartido/fotos-orden/fotos-orden.component';
import { formatearDinero, formatearHora } from '../../../compartido/formato';
import {
  diasGarantia,
  diasParaRecoger,
  ESTADOS_ORDEN,
  Evento,
  Orden,
  OrdenesService,
  diasDesde,
  etiquetaEstado,
  garantiaRestante,
  saldo,
  sumarDias,
} from '../ordenes.service';
import { SeguimientoOrdenComponent } from '../seguimiento-orden/seguimiento-orden.component';

export type AccionOrden = 'reimprimir' | 'reenviar-acceso' | 'avisar' | 'responder' | 'entregar' | 'garantia' | 'bodega' | 'recordatorio';

const mes = (fecha: Date) => fecha.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');
/** "12 oct" */
export const diaMes = (iso: string) => `${new Date(iso).getDate()} ${mes(new Date(iso))}`;
/** "12 oct · 17:45", o "Hoy 11:30" */
export function cuando(iso: string, conPunto = true): string {
  const fecha = new Date(iso);
  const hoy = new Date().toDateString() === fecha.toDateString();
  return hoy ? `Hoy ${formatearHora(fecha)}` : `${diaMes(iso)}${conPunto ? ' ·' : ''} ${formatearHora(fecha)}`;
}

/** C4.1 · C4.3 · C4.4 · C4.6 · C4.8 · Panel con el detalle de la orden seleccionada. */
@Component({
  selector: 'app-detalle-orden',
  standalone: true,
  imports: [SeguimientoOrdenComponent, FotosOrdenComponent],
  templateUrl: './detalle-orden.component.html',
  styleUrl: './detalle-orden.component.css',
})
export class DetalleOrdenComponent {
  readonly orden = input.required<Orden>();
  private readonly ordenes = inject(OrdenesService);
  private readonly cajera = inject(AuthService).sesion()?.nombre ?? '';

  /** Fotos del equipo: se pueden agregar o quitar mientras la orden siga en el taller. */
  protected readonly fotosEditables = computed(() => !['terminada', 'sin-reparar-entregada'].includes(this.orden().estado));

  protected agregarFotos(fotos: { url: string; nombre: string }[]): void {
    this.ordenes.agregarFotos(this.orden().folio, fotos, this.cajera);
  }

  protected quitarFoto(id: string): void {
    this.ordenes.quitarFoto(this.orden().folio, id, this.cajera);
  }
  readonly accion = output<AccionOrden>();

  protected readonly dinero = formatearDinero;
  protected readonly cuando = cuando;
  protected readonly diaMes = diaMes;
  protected readonly estados = ESTADOS_ORDEN;
  protected readonly etiqueta = computed(() => etiquetaEstado(this.orden()));
  protected readonly saldo = computed(() => saldo(this.orden()));
  protected readonly garantia = computed(() => garantiaRestante(this.orden()));
  protected readonly enMostrador = computed(() => ['lista', 'sin-reparacion', 'vencida', 'garantia-lista'].includes(this.orden().estado));

  /** Fecha límite para recoger: el plazo de Configuración (J9) desde el aviso de "Listo". */
  protected readonly plazo = diasParaRecoger();
  protected readonly limite = computed(() => {
    const desde = this.orden().listaDesde;
    return desde ? diaMes(sumarDias(desde, diasParaRecoger())) : '';
  });

  protected readonly diasDesdeAviso = computed(() => {
    const desde = this.orden().listaDesde;
    return desde ? diasDesde(desde) : 0;
  });

  protected readonly venceGarantia = computed(() => {
    const entrega = this.orden().entrega;
    return entrega ? diaMes(sumarDias(entrega.fecha, diasGarantia())) : '';
  });

  /** El historial con fechas del día como "Hoy 11:20". */
  protected linea(evento: Evento): string {
    return `${cuando(evento.fecha)} · ${evento.texto}`;
  }
}
