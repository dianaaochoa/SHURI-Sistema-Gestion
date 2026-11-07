import { Component, ElementRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { formatearDinero } from '../../compartido/formato';
import { DispositivosService } from '../punto-de-venta/dispositivos.service';
import { AccionOrden, DetalleOrdenComponent, diaMes } from './detalle-orden/detalle-orden.component';
import { EnviarBodegaComponent, EnvioBodega } from './enviar-bodega/enviar-bodega.component';
import {
  DIAS_PARA_RECOGER,
  ESTADOS_ORDEN,
  FILTROS,
  Filtro,
  Orden,
  OrdenesService,
  diasDesde,
  etiquetaEstado,
  saldo,
} from './ordenes.service';
import { RecepcionGarantia, RecibirGarantiaComponent } from './recibir-garantia/recibir-garantia.component';
import { RespuestaClienteComponent } from './respuesta-cliente/respuesta-cliente.component';

type Modal = 'respuesta' | 'garantia' | 'bodega';

const sinAcentos = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * C4 · Órdenes de servicio.
 * C4.1 lista con detalle · C4.2 respuesta en mostrador · C4.3 lista para entregar · C4.4 garantía activa ·
 * C4.5 recibir en garantía · C4.6 equipos en bodega · C4.7 enviar a bodega · C4.8 cargo adicional · C4.9 sin resultados.
 */
@Component({
  selector: 'app-ordenes',
  standalone: true,
  imports: [RouterLink, DetalleOrdenComponent, RespuestaClienteComponent, RecibirGarantiaComponent, EnviarBodegaComponent],
  templateUrl: './ordenes.component.html',
  styleUrl: './ordenes.component.css',
})
export class OrdenesComponent {
  private readonly servicio = inject(OrdenesService);
  private readonly dispositivos = inject(DispositivosService);
  private readonly router = inject(Router);
  private readonly tabla = viewChild<ElementRef<HTMLElement>>('tabla');
  protected readonly cajera = inject(AuthService).sesion()?.nombre ?? '';

  protected readonly filtros = FILTROS;
  protected readonly estados = ESTADOS_ORDEN;
  protected readonly dinero = formatearDinero;
  protected readonly diaMes = diaMes;
  protected readonly etiqueta = etiquetaEstado;

  protected readonly filtro = signal<Filtro>('todas');
  protected readonly busqueda = signal('');
  protected readonly enBodega = computed(() => this.filtro() === 'bodega');

  protected readonly conteos = computed(() => {
    const ordenes = this.servicio.ordenes();
    return Object.fromEntries(
      FILTROS.map((f) => [f.id, f.estados.length ? ordenes.filter((o) => f.estados.includes(o.estado)).length : ordenes.length]),
    ) as Record<Filtro, number>;
  });

  protected readonly visibles = computed(() => {
    const definicion = FILTROS.find((f) => f.id === this.filtro())!;
    const texto = sinAcentos(this.busqueda().trim());
    const digitos = texto.replace(/\D/g, '');
    return this.servicio
      .ordenes()
      .filter((o) => !definicion.estados.length || definicion.estados.includes(o.estado))
      .filter(
        (o) =>
          !texto ||
          sinAcentos(o.folio).includes(texto) ||
          sinAcentos(o.cliente.nombre).includes(texto) ||
          sinAcentos(o.equipo).includes(texto) ||
          (digitos.length >= 4 && (o.cliente.telefono.replace(/\D/g, '').includes(digitos) || o.imei.includes(digitos))),
      );
  });

  /** "Días": desde que se recibió, o desde el aviso de "Listo" en la vista de bodega (C4.6). */
  protected dias(orden: Orden): number {
    return diasDesde(this.enBodega() && orden.listaDesde ? orden.listaDesde : orden.recibido);
  }

  protected fechaColumna(orden: Orden): string {
    return diaMes(this.enBodega() && orden.listaDesde ? orden.listaDesde : orden.recibido);
  }

  // ---------- Indicadores ----------
  protected readonly indicadores = computed(() => {
    const ordenes = this.servicio.ordenes();
    const porAprobar = ordenes.filter((o) => o.estado === 'por-aprobar' || o.estado === 'adicional');
    const atrasadas = porAprobar.filter((o) => diasDesde((o.adicional ?? o.presupuesto)!.enviado) > 7).length;
    return {
      activas: ordenes.filter((o) => !['terminada', 'bodega'].includes(o.estado)).length,
      porAprobar: porAprobar.length,
      atrasadas,
      listas: ordenes.filter((o) => o.estado === 'lista' || o.estado === 'sin-reparacion').length,
      bodega: ordenes.filter((o) => o.estado === 'bodega').length,
    };
  });

  /** C4.6: indicadores de la vista de bodega. */
  protected readonly indicadoresBodega = computed(() => {
    const ordenes = this.servicio.ordenes();
    const bodega = ordenes.filter((o) => o.estado === 'bodega');
    const semana = Date.now() - 7 * 86_400_000;
    return {
      bodega: bodega.length,
      ubicacion: bodega[0]?.bodega?.ubicacion ?? 'Bodega trasera',
      vencidas: this.servicio.vencidas().length,
      saldo: bodega.reduce((suma, o) => suma + saldo(o), 0),
      avisados: bodega.filter((o) => o.contactos.some((c) => new Date(c.fecha).getTime() >= semana)).length,
    };
  });

  // ---------- Selección ----------
  private readonly folioElegido = signal<string | null>(null);
  protected readonly seleccionada = computed(() => {
    const lista = this.visibles();
    return lista.find((o) => o.folio === this.folioElegido()) ?? lista[0] ?? null;
  });

  protected readonly modal = signal<Modal | null>(null);
  protected readonly aviso = signal<string | null>(null);
  /** Folio que se abrió desde el panel en "Enviar a bodega". */
  protected readonly folioParaBodega = signal<string | null>(null);
  protected readonly vencidas = this.servicio.vencidas;
  protected readonly siguienteEstante = computed(() => {
    const usados = this.servicio
      .ordenes()
      .map((o) => Number(o.bodega?.estante.replace(/\D/g, '') || 0))
      .reduce((max, n) => Math.max(max, n), 0);
    return `B-${usados + 1}`;
  });

  elegirFiltro(filtro: Filtro): void {
    this.filtro.set(filtro);
    this.folioElegido.set(null);
  }

  elegir(orden: Orden): void {
    this.folioElegido.set(orden.folio);
  }

  moverSeleccion(evento: Event, paso: number): void {
    evento.preventDefault();
    const lista = this.visibles();
    const actual = lista.findIndex((o) => o.folio === this.seleccionada()?.folio);
    const siguiente = lista[Math.max(0, Math.min(lista.length - 1, actual + paso))];
    if (!siguiente) return;
    this.folioElegido.set(siguiente.folio);
    setTimeout(() => this.tabla()?.nativeElement.querySelector<HTMLElement>(`[data-folio="${siguiente.folio}"]`)?.focus());
  }

  abrirBodega(folio: string | null = null): void {
    this.folioParaBodega.set(folio);
    this.modal.set('bodega');
  }

  ejecutar(accion: AccionOrden, orden: Orden): void {
    const contacto = orden.cliente.correo ?? orden.cliente.telefono;
    switch (accion) {
      case 'reimprimir':
        this.aviso.set(this.dispositivos.imprimir(orden.folio) ? `Orden ${orden.folio} reimpresa` : 'La impresora no responde: revisa que esté encendida, con papel y conectada');
        break;
      case 'reenviar-acceso':
        this.aviso.set(`Se reenvió el acceso al portal de ${orden.cliente.nombre} (${contacto})`);
        break;
      case 'avisar':
        this.servicio.avisar(orden.folio, 'Recordatorio para recoger en el portal');
        this.aviso.set(`Se avisó a ${orden.cliente.nombre} que su equipo está listo para recoger`);
        break;
      case 'recordatorio':
        this.servicio.avisar(orden.folio, 'Recordatorio por correo');
        this.aviso.set(`Recordatorio enviado a ${contacto}`);
        break;
      case 'responder':
        this.modal.set('respuesta');
        break;
      case 'garantia':
        this.modal.set('garantia');
        break;
      case 'bodega':
        this.abrirBodega(orden.folio);
        break;
      case 'entregar':
        // C6 Entrega de equipo recibe el folio ya cargado.
        this.router.navigate(['/cajera/entrega-de-equipo'], { queryParams: { folio: orden.folio.replace('#', '') } });
        break;
    }
  }

  guardarRespuesta(orden: Orden, respuesta: { aprobo: boolean; nota: string }): void {
    const adicional = orden.estado === 'adicional';
    this.servicio.registrarRespuesta(orden.folio, respuesta.aprobo, respuesta.nota, this.cajera);
    this.aviso.set(
      `${adicional ? 'Adicional' : 'Presupuesto'} de ${orden.folio} ${respuesta.aprobo ? 'aprobado' : 'rechazado'} · ` +
        (respuesta.aprobo || adicional ? 'el técnico ya recibió el aviso' : 'queda listo para que el cliente lo recoja'),
    );
    this.modal.set(null);
  }

  registrarGarantia(orden: Orden, recepcion: RecepcionGarantia): void {
    this.servicio.recibirGarantia(orden.folio, recepcion.falla, recepcion.tecnico, this.cajera);
    const impreso = this.dispositivos.imprimir(orden.folio);
    this.aviso.set(
      `Garantía de ${orden.folio} recibida · asignada a ${recepcion.tecnico.nombre}` +
        (recepcion.avisar ? ' · aviso enviado al portal' : '') +
        (impreso ? '' : ' · no se pudo imprimir el comprobante'),
    );
    this.modal.set(null);
  }

  enviarABodega(envio: EnvioBodega): void {
    this.servicio.enviarABodega(envio.folios, envio.ubicacion, envio.estante, envio.avisar, this.cajera);
    const n = envio.folios.length;
    this.aviso.set(`${n} ${n === 1 ? 'equipo enviado' : 'equipos enviados'} a ${envio.ubicacion} · ${envio.estante}`);
    this.modal.set(null);
  }

  limpiarBusqueda(): void {
    this.busqueda.set('');
    this.elegirFiltro('todas');
  }

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    if (!this.modal()) this.aviso.set(null);
  }

  protected readonly diasParaRecoger = DIAS_PARA_RECOGER;
}
