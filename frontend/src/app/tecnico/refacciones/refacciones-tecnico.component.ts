import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { InventarioService } from '../../cajera/inventario/inventario.service';
import { Orden, OrdenesService } from '../../cajera/ordenes/ordenes.service';
import { EstadoPieza, RefaccionesService, Solicitud } from '../../jefe/refacciones/refacciones.service';
import { asignadas, diaCorto, tecnicoDe } from '../mi-trabajo';
import { DevolverPiezaComponent } from './devolver-pieza/devolver-pieza.component';
import { NuevaSolicitudComponent, SolicitudNueva } from './nueva-solicitud/nueva-solicitud.component';

/** Las palabras del técnico (T5.3); el jefe confirma con las suyas en J5.3. */
const COMO_REGRESA: Record<EstadoPieza, string> = { nueva: 'nueva, sin abrir', abierta: 'abierta, sin instalar', danada: 'dañada o defectuosa' };

type Vista = 'todas' | 'pendientes' | 'por-pedir' | 'entregadas' | 'por-devolver';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
const esHoy = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
/** "Hoy 10:25" o "15 oct 17:40" */
const cuando = (iso: string) => `${esHoy(iso) ? 'Hoy' : diaCorto(iso)} ${hora(iso)}`;

/** La orden ya no se repara: la pieza entregada no se usó y hay que devolverla (T5.3). */
const sinReparar = (o?: Orden) => !!o && (o.estado === 'sin-reparacion' || o.estado === 'sin-reparar-entregada' || !!o.rechazo || o.trabajo.startsWith('Sin reparación'));

/** T5.1 · Refacciones que pidió el técnico · T5.2 nueva solicitud · T5.3 devolver · T5.4 sin solicitudes. */
@Component({
  selector: 'app-refacciones-tecnico',
  standalone: true,
  imports: [NuevaSolicitudComponent, DevolverPiezaComponent],
  templateUrl: './refacciones-tecnico.component.html',
  styleUrls: ['../../jefe/lista-pagina.css', './refacciones-tecnico.component.css'],
})
export class RefaccionesTecnicoComponent {
  private readonly router = inject(Router);
  private readonly servicio = inject(RefaccionesService);
  private readonly inventario = inject(InventarioService);
  private readonly ordenes = inject(OrdenesService).ordenes;
  private readonly nombre = inject(AuthService).sesion()?.nombre ?? '';
  private readonly tecnico = tecnicoDe(this.nombre);

  protected readonly vista = signal<Vista>('todas');
  protected readonly nueva = signal(false);
  protected readonly devolviendo = signal<Solicitud | null>(null);
  protected readonly aviso = signal('');

  /** Sus órdenes abiertas, para elegir en la nueva solicitud. */
  protected readonly misOrdenes = computed(() => asignadas(this.tecnico, this.ordenes()));

  /** Cada solicitud con su estado para el técnico. */
  private readonly todas = computed(() => {
    const devueltas = new Set(this.servicio.devoluciones().map((d) => d.id));
    return this.servicio
      .solicitudes()
      .filter((s) => s.tecnico === this.nombre)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map((s) => {
        const orden = this.ordenes().find((o) => o.folio === s.orden);
        const producto = this.inventario.buscar(s.sku);
        const stock = producto ? this.inventario.paraOrden(s.sku, s.orden) : null;
        let estado: { texto: string; tono: string; vista: Vista };
        if (s.estado === 'pendiente') estado = stock !== null && stock >= s.cantidad ? { texto: 'Pendiente', tono: 'advertencia', vista: 'pendientes' } : { texto: 'Por pedir a proveedor', tono: 'peligro', vista: 'por-pedir' };
        else if (s.estado === 'pedida') {
          const llega = this.inventario.llegada(s.sku);
          estado = { texto: llega ? `Pedida · llega ${diaCorto(llega)}` : `Pedida · ${s.pedido ?? ''}`.trim(), tono: 'info', vista: 'por-pedir' };
        } else if (s.estado === 'rechazada') estado = { texto: 'Rechazada', tono: 'neutro', vista: 'todas' };
        else if (devueltas.has(s.id)) estado = { texto: 'Devuelta', tono: 'neutro', vista: 'entregadas' };
        else if (sinReparar(orden)) estado = { texto: 'Por devolver', tono: 'info', vista: 'por-devolver' };
        else estado = { texto: s.entregada && esHoy(s.entregada) ? `Entregada ${hora(s.entregada)}` : 'Entregada', tono: 'exito', vista: 'entregadas' };
        const accion = s.estado === 'pendiente' ? 'Cancelar' : estado.vista === 'por-devolver' ? 'Devolver' : 'Ver';
        return {
          s,
          estado,
          accion,
          solicitada: cuando(s.fecha),
          stock: stock === null ? { texto: '—', tono: 'neutro' } : stock > 0 ? { texto: `${stock} en stock`, tono: 'exito' } : { texto: 'Sin stock', tono: 'peligro' },
          detalle: producto?.sku === s.sku && s.sku.startsWith('CON') ? `${s.nombre} · ${s.sku}` : s.nombre,
        };
      });
  });

  protected readonly total = computed(() => this.todas().length);
  private readonly de = (v: Vista) => this.todas().filter((r) => r.estado.vista === v);

  protected readonly indicadores = computed(() => {
    const semana = Date.now() - 7 * 86_400_000;
    return [
      { vista: 'pendientes' as Vista, valor: this.de('pendientes').length, tono: 'advertencia', titulo: 'Pendientes', detalle: 'Esperando al jefe' },
      { vista: 'por-pedir' as Vista, valor: this.de('por-pedir').length, tono: 'peligro', titulo: 'Por pedir a proveedor', detalle: 'Sin stock' },
      { vista: 'entregadas' as Vista, valor: this.todas().filter((r) => r.s.entregada && new Date(r.s.entregada).getTime() >= semana).length, tono: 'exito', titulo: 'Entregadas esta semana', detalle: 'Ya en tus órdenes' },
      { vista: 'por-devolver' as Vista, valor: this.de('por-devolver').length, tono: 'primario', titulo: 'Por devolver', detalle: 'No se usó' },
    ];
  });

  protected readonly pestanas = computed(() => [
    { id: 'todas' as Vista, texto: `Todas (${this.total()})` },
    { id: 'pendientes' as Vista, texto: 'Pendientes' },
    { id: 'por-pedir' as Vista, texto: 'Por pedir' },
    { id: 'entregadas' as Vista, texto: 'Entregadas' },
    { id: 'por-devolver' as Vista, texto: 'Por devolver' },
  ]);

  protected readonly renglones = computed(() => (this.vista() === 'todas' ? this.todas() : this.de(this.vista())));

  protected accion(r: { s: Solicitud; accion: string }): void {
    if (r.accion === 'Cancelar') {
      this.servicio.cancelar(r.s.id, this.nombre);
      this.aviso.set(`${r.s.id} cancelada: ${r.s.nombre} ya no le aparece al jefe.`);
    } else if (r.accion === 'Devolver') this.devolviendo.set(r.s);
    else this.router.navigate(['/tecnico/banco-de-trabajo'], { queryParams: { folio: r.s.orden.replace('#', '') } });
  }

  protected crear(d: SolicitudNueva): void {
    const s = this.servicio.solicitar({ orden: d.orden, tecnico: this.nombre, sku: d.producto.sku, nombre: d.producto.nombre, cantidad: d.cantidad, urgencia: d.urgencia, nota: d.nota || undefined });
    this.nueva.set(false);
    this.vista.set('todas');
    this.aviso.set(`${s.id} enviada al jefe: ${s.nombre} ×${s.cantidad} para ${s.orden}.`);
  }

  protected devolver(p: { estado: EstadoPieza; nota: string }): void {
    const s = this.devolviendo()!;
    const motivo = p.nota.trim() || 'no se usó';
    this.servicio.devolverPieza(s, p.estado, motivo);
    this.devolviendo.set(null);
    this.aviso.set(`${s.id} devuelta como “${COMO_REGRESA[p.estado]}”: el jefe confirma la recepción.`);
  }
}
